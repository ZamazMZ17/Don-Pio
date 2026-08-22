/**
 * Auditoría de humo: ~2 meses de reparto real contra la base de datos de
 * verdad (Dexie + fake-indexeddb), no contra mocks. Un solo generador
 * pseudoaleatorio con semilla fija recorre casi todos los caminos de negocio
 * — pesadas normales, sin pesar con y sin total, pollos partidos, cobros
 * parciales y de más, correcciones en caliente y de días ya cerrados,
 * deshacer cobros viejos, deudas heredadas de la libreta, días que se le
 * olvida cerrar — y en varios puntos de control compara dos implementaciones
 * independientes de "cuánto debe cada tienda" (`fichaDe()` en tiendas.ts y
 * `cuentasPendientes()` en entregas.ts): si alguna vez divergen, es una señal
 * fuerte de un bug real, no de que una de las dos esté "más actualizada".
 *
 * Así se encontraron y arreglaron tres bugs reales de plata perdida (ver
 * CLAUDE.md §7 bis): dos entregas sin precio el mismo día que se comían el
 * pago de la segunda, deshacer un cobro de un día ya cerrado que dejaba el
 * saldo atrapado sin que nadie lo viera, y borrar una entrega vieja que
 * podía recortarle el "cobrado" a un día completamente distinto y ya
 * cerrado. Esta simulación se deja corriendo (semilla fija, reproducible)
 * para que una regresión futura en cualquiera de esos caminos se note aquí
 * antes que en el teléfono.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  borrarEntrega,
  cobrarEntrega,
  cobrosDe,
  cuentasPendientes,
  deshacerCobro,
  editarEntrega,
  registrarCobro,
  registrarEntrega,
} from "./entregas";
import { cerrarDia, cerrarDiasPasados, guardarStock, limpiarMigajas, resumenDe } from "./jornada";
import { agregarDeuda, crearTienda, fichaDe, identificar } from "./tiendas";
import { aCentimos, aCobrar, aGramos, money } from "../lib/dinero";
import { diaSemana, sumarDias } from "../lib/fecha";

beforeEach(async () => {
  await Promise.all([
    db.tiendas.clear(),
    db.entregas.clear(),
    db.deudas.clear(),
    db.pagos.clear(),
    db.jornadas.clear(),
  ]);
});

/** Generador determinista: mismo resultado en cada corrida, para poder reproducir fallos. */
function rng(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe("SIMULACIÓN: ~2 meses de reparto real", () => {
  it("no revienta y el dinero cuadra en cada tienda, en cada punto de control", async () => {
    const rand = rng(20260822);
    const elegir = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

    const DIAS = 55;
    const INICIO = "2026-06-01";
    const fechas = Array.from({ length: DIAS }, (_, i) => sumarDias(INICIO, i));

    // El directorio: nombres con homónimos deliberados para ejercitar el
    // emparejador (§6) — "Rosa" temprano y "Rosa" tarde, "Elsa" idem.
    const nombresBase = [
      "Doña Elsa (mañana)",
      "Elsa",
      "Rosa (early)",
      "Rosa",
      "Chela",
      "Julio Ramírez",
      "Olga",
      "Marta",
      "Auricia",
      "Ayde",
      "Carmen",
      "Don Pepe",
    ];
    const tiendaIdPorNombre = new Map<string, number>();
    for (const n of nombresBase) {
      const t = await crearTienda(n);
      tiendaIdPorNombre.set(n, t.id!);
    }
    // Un par de deudas heredadas de la libreta, antes de que existiera la app.
    await agregarDeuda(tiendaIdPorNombre.get("Chela")!, aCentimos(18.5), sumarDias(INICIO, -3));
    await agregarDeuda(tiendaIdPorNombre.get("Olga")!, aCentimos(4.2), sumarDias(INICIO, -3));

    const anomalias: string[] = [];
    const nota = (msg: string) => anomalias.push(msg);

    let precioBase = aCentimos(8.5);
    let diasNoCerrados = 0;

    /**
     * Comprueba invariantes estructurales y cruza las dos implementaciones
     * independientes de "cuánto debe": `fichaDe()` (tiendas.ts) y
     * `cuentasPendientes()` (entregas.ts).
     *
     * Ojo: **no** se puede recalcular "lo que debe" sumando `saldoDe()` sobre
     * las entregas de días cerrados — es la trampa en la que cayó la primera
     * versión de esta sonda. Por diseño (§8), al cerrar el día el saldo pasa
     * a `deudas` y la entrega **congela** sus campos de dinero: un pago
     * posterior contra esa deuda solo toca `deudas.saldado`, nunca vuelve a
     * la entrega. Sumar `saldoDe()` de entregas cerradas después de que se
     * les pagó algo da un número inflado que no significa nada — no es un
     * bug de la app, es la propia arquitectura documentada.
     */
    async function verificarDinero(etiqueta: string, comoHoy: string) {
      const tiendas = await db.tiendas.toArray();
      for (const t of tiendas) {
        const entregas = await db.entregas.where("tiendaId").equals(t.id!).toArray();
        const deudas = await db.deudas.where("tiendaId").equals(t.id!).toArray();

        // Invariante estructural: nunca una deuda saldada de más, ni dinero
        // negativo ni NaN en ningún campo.
        for (const d of deudas) {
          if (d.saldado > d.monto) {
            nota(
              `[${etiqueta}] tienda ${t.nombre}: deuda #${d.id} saldado(${money(d.saldado)}) > monto(${money(d.monto)})`,
            );
          }
          if (d.monto < 0 || d.saldado < 0) {
            nota(`[${etiqueta}] tienda ${t.nombre}: deuda #${d.id} con monto/saldado negativo`);
          }
        }
        for (const e of entregas) {
          if (e.totalCobrado < 0 || e.totalCalculado < 0 || e.descuentoRedondeo < 0) {
            nota(`[${etiqueta}] tienda ${t.nombre}: entrega #${e.id} con un campo de dinero negativo`);
          }
          if (!Number.isFinite(e.totalCalculado) || !Number.isFinite(e.totalCobrado)) {
            nota(`[${etiqueta}] tienda ${t.nombre}: entrega #${e.id} con NaN/Infinity`);
          }
        }

        // Cruce entre las dos implementaciones independientes de "cuánto
        // debe": fichaDe() (tiendas.ts) y cuentasPendientes() (entregas.ts).
        const ficha = await fichaDe(t.id!);
        const pendHoy = await cuentasPendientes(comoHoy);
        const cuenta = pendHoy.find((c) => c.tienda.id === t.id);
        const totalCuenta = cuenta?.total ?? 0;
        if (Math.abs((ficha?.debe ?? 0) - totalCuenta) > 10) {
          nota(
            `[${etiqueta}] tienda ${t.nombre}: fichaDe().debe=${money(ficha?.debe ?? 0)} ` +
              `≠ cuentasPendientes().total=${money(totalCuenta)}`,
          );
        }
      }
    }

    for (let i = 0; i < fechas.length; i++) {
      const fecha = fechas[i];
      const dow = diaSemana(fecha);
      if (dow === 0) continue; // domingo: no reparte

      // El precio base sube o baja cada ~12 días.
      if (i % 12 === 0 && i > 0) {
        precioBase = Math.max(aCentimos(6), precioBase + elegir([-80, -50, 40, 60, 90]));
      }
      const stockPollos = 90 + Math.floor(rand() * 60);
      const stockPiernas = 20 + Math.floor(rand() * 30);
      await guardarStock(fecha, stockPollos, stockPiernas, precioBase);

      // Quién reparte hoy: casi todos, salvo un par que solo van ciertos días.
      const activos = nombresBase.filter((n) => {
        if (n === "Don Pepe") return dow === 2 || dow === 5; // solo mar/vie
        if (n === "Carmen") return dow !== 1; // no lunes
        return rand() > 0.08; // 8% de faltar cualquier día
      });

      let piernasSueltasHoy = stockPiernas;
      const entregasHoyIds: number[] = [];

      for (const nombre of activos) {
        const tId = tiendaIdPorNombre.get(nombre)!;

        // Simula el flujo real: primero identificar() como hace la app.
        const { resultado } = await identificar(nombre, fecha);
        if (resultado.decision === "nueva") {
          nota(`[${fecha}] identificar("${nombre}") dio "nueva" pese a ya existir en el directorio`);
        }

        const tipo = rand();
        let entregaId: number;
        if (tipo < 0.55) {
          // Pesada normal, 1 o 2 tandas.
          const tandas = rand() < 0.3 ? [aGramos(4 + rand() * 3), aGramos(3 + rand() * 3)] : [aGramos(6 + rand() * 8)];
          const pollos = 3 + Math.floor(rand() * 6);
          const t = await db.tiendas.get(tId);
          const precioKg = Math.max(aCentimos(5), precioBase + (t?.precioOffsetKg ?? 0) + elegir([-20, 0, 0, 20]));
          entregaId = await registrarEntrega(
            { tiendaId: tId, pollos, tandas, precioKg },
            { minuto: 300 + i, posicion: entregasHoyIds.length + 1 },
            { fecha, dictado: nombre },
          );
        } else if (tipo < 0.7) {
          // Pollos partidos: pechos que salen de partir, piernas sueltas de más.
          const pollos = 2 + Math.floor(rand() * 3);
          const pechos = 1 + Math.floor(rand() * 2);
          const piernas = Math.min(piernasSueltasHoy, 1 + Math.floor(rand() * 3));
          piernasSueltasHoy = Math.max(0, piernasSueltasHoy - piernas);
          const peso = aGramos(pollos * 1.3 + pechos * 0.6 + piernas * 0.35);
          entregaId = await registrarEntrega(
            { tiendaId: tId, pollos, pechos, piernas, tandas: [peso], precioKg: precioBase },
            { minuto: 300 + i, posicion: entregasHoyIds.length + 1 },
            { fecha, dictado: nombre },
          );
        } else if (tipo < 0.85) {
          // Sin pesar, con total dictado (cliente de confianza).
          const total = aCentimos(20 + rand() * 60);
          entregaId = await registrarEntrega(
            { tiendaId: tId, pollos: 2 + Math.floor(rand() * 4), sinPesar: true, totalDictado: total },
            { minuto: 300 + i, posicion: entregasHoyIds.length + 1 },
            { fecha, dictado: nombre },
          );
        } else {
          // Sin pesar y SIN total: el caso que ya rompía el reparto de pagos.
          entregaId = await registrarEntrega(
            { tiendaId: tId, pollos: 1 + Math.floor(rand() * 3), sinPesar: true },
            { minuto: 300 + i, posicion: entregasHoyIds.length + 1 },
            { fecha, dictado: nombre },
          );
        }
        entregasHoyIds.push(entregaId);

        // A veces le deja dos veces el mismo día (pasa dos veces por la ruta).
        if (rand() < 0.06) {
          const segundoId = await registrarEntrega(
            { tiendaId: tId, pollos: 1 + Math.floor(rand() * 2), sinPesar: true },
            { minuto: 300 + i, posicion: entregasHoyIds.length + 1 },
            { fecha, dictado: nombre },
          );
          entregasHoyIds.push(segundoId);
        }

        // Cobro inmediato, cliente de confianza que paga al toque.
        if (rand() < 0.1) {
          const e = await db.entregas.get(entregaId);
          if (e && e.totalCalculado > 0) await cobrarEntrega(entregaId, e.totalCalculado);
        }

        // Corrección en caliente: se dio cuenta al toque de que pesó mal.
        if (rand() < 0.05) {
          const e = await db.entregas.get(entregaId);
          if (e) await editarEntrega(entregaId, { pollos: Math.max(1, e.pollos + elegir([-1, 1])) });
        }

        // A veces se equivocó de tienda y la borra.
        if (rand() < 0.02) {
          await borrarEntrega(entregaId);
          entregasHoyIds.pop();
        }
      }

      // aprender() ya corre dentro de registrarEntrega vía aprenderDeEntrega;
      // nada más que hacer aquí para el aprendizaje de ruta/hora.

      // Vuelta de cobranza: recorre las cuentas del día y cobra la mayoría.
      const cuentas = await cuentasPendientes(fecha);
      for (const c of cuentas) {
        const r = rand();
        if (r < 0.62) {
          // Paga todo, con redondeo aceptado como hace el botón real.
          await registrarCobro(c.tienda.id!, c.total, { fecha, aceptarRedondeo: true });
        } else if (r < 0.85) {
          // Paga una parte.
          const parcial = aCobrar(Math.max(100, Math.floor(c.total * (0.2 + rand() * 0.6))));
          await registrarCobro(c.tienda.id!, parcial, { fecha });
        } else if (r < 0.93) {
          // Le da de más (vuelto): no debería romper nada.
          await registrarCobro(c.tienda.id!, c.total + aCentimos(5 + rand() * 15), { fecha });
        }
        // El resto (7%) se queda debiendo, sin tocar hoy.
      }

      // Cierra el día casi siempre, pero a veces se le olvida.
      if (rand() < 0.9) {
        const resumen = await resumenDe(fecha);
        const cajaContada = resumen.cobrado; // cuadra perfecto, o casi
        await cerrarDia(fecha, cajaContada, true);
      } else {
        diasNoCerrados++;
      }

      // Cada ~10 días simulados, "abre la app" con esa fecha como hoy: cierra
      // solos los días atrasados y limpia migajas, como hace App.tsx de verdad.
      if (i % 10 === 9) {
        await cerrarDiasPasados(fecha);
        await limpiarMigajas();
        await verificarDinero(`chequeo día ${fecha}`, fecha);
      }
    }

    // Cierre final: como si abriera la app el último día simulado.
    const hoyFinal = fechas[fechas.length - 1];
    await cerrarDiasPasados(hoyFinal);
    await limpiarMigajas();
    await verificarDinero("chequeo final", hoyFinal);

    // Un puñado de deshacer-cobro sobre cobros ya viejos y de días cerrados,
    // el escenario que rompía la plata antes del arreglo.
    for (const [nombre, tId] of tiendaIdPorNombre) {
      const cobros = await cobrosDe(tId, fechas[Math.max(0, fechas.length - 15)]);
      if (cobros.length > 0 && rand() < 0.4) {
        try {
          await deshacerCobro(tId, cobros[0].creada);
        } catch (err) {
          nota(`deshacerCobro reventó para "${nombre}": ${(err as Error).message}`);
        }
      }
    }
    await verificarDinero("tras deshacer cobros viejos al azar", hoyFinal);

    console.log(`\ndías simulados: ${fechas.filter((f) => diaSemana(f) !== 0).length}, no cerrados a propósito: ${diasNoCerrados}`);
    console.log(`anomalías encontradas: ${anomalias.length}`);
    if (anomalias.length > 0) {
      console.log(anomalias.slice(0, 40).join("\n"));
    }
    expect(anomalias).toEqual([]);
  }, 60000);
});
