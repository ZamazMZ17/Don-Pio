import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  agregarTanda,
  borrarEntrega,
  cobrarEntrega,
  cobrosDe,
  deshacerCobro,
  cuentasDelDia,
  cuentasPendientes,
  editarEntrega,
  fijarPeso,
  fijarTotal,
  registrarCobro,
  registrarEntrega,
} from "./entregas";
import { cerrarDia, cerrarDiasPasados, guardarStock, limpiarMigajas, resumenDe } from "./jornada";
import { agregarDeuda, crearTienda, fichaDe, precioEfectivoKg } from "./tiendas";
import { aCentimos, aGramos, money } from "../lib/dinero";
import { sumarDias } from "../lib/fecha";
import type { Contexto } from "../tiendas/emparejar";

const HOY = "2026-08-07";
const AYER = "2026-08-06";

const ctx = (posicion: number, minuto = 420): Contexto => ({ minuto, posicion });

beforeEach(async () => {
  await Promise.all([
    db.tiendas.clear(),
    db.entregas.clear(),
    db.deudas.clear(),
    db.pagos.clear(),
    db.jornadas.clear(),
  ]);
});

describe("registrar una entrega", () => {
  it("calcula el total y deja aprendida la tienda", async () => {
    const t = await crearTienda("Don Julio Ramírez");
    await registrarEntrega(
      {
        tiendaId: t.id!,
        pollos: 8,
        tandas: [aGramos(14.2), aGramos(12.0)],
        precioKg: aCentimos(9.5),
      },
      ctx(2, 430),
      { fecha: HOY, dictado: "don Julio" },
    );

    const e = (await db.entregas.toArray())[0];
    expect(money(e.totalCalculado)).toBe("S/ 248.90");
    expect(e.peso).toBe(26200);
    expect(e.estadoPago).toBe("pendiente");

    // La entrega deja rastro: hora, parada y el precio que dictó.
    const aprendida = await db.tiendas.get(t.id!);
    expect(aprendida?.minutos).toEqual([430]);
    expect(aprendida?.ordenRuta).toBe(2);
    expect(aprendida?.precioKgDefecto).toBe(aCentimos(9.5));
  });

  it("un total dictado corrige la diferencia de precio aprendida, no solo un precio dictado directo", async () => {
    /*
     * Caso real: Olga tenía una diferencia vieja de -0.80 aprendida cuando el
     * base era más alto. El base bajó y ahora, cobrándole exactamente el
     * base (diferencia real 0), si solo dicta el total —no «a 8 el kilo»—
     * la tarjeta ya trae precargado el precio con la diferencia vieja
     * (`datos.precioKg`, la sugerencia). Antes del arreglo, `aprenderDeEntrega`
     * volvía a aprender de esa sugerencia en vez de lo que el total
     * realmente implicaba, y la diferencia se quedaba pegada en -0.80 para
     * siempre. Tiene que corregirse sola con lo que el total dice de verdad.
     */
    const t = await crearTienda("Olga", { precioKgDefecto: aCentimos(8) });
    await db.tiendas.update(t.id!, { precioOffsetKg: -aCentimos(0.8) });
    await db.jornadas.put({
      fecha: HOY,
      stockPollos: 40,
      stockPiernas: 4,
stockPechos: 0,
      precioBaseKg: aCentimos(8),
      horaCierre: "19:30",
      estado: "abierta",
      cajaContada: null,
      cuadro: null,
      creada: Date.now(),
      cerradaEn: null,
    });

    // Lo que App.tsx le pasaría como `datos.precioKg`: la sugerencia vieja
    // (base 8 + diferencia -0.80 = 7.20), porque no dictó un precio por
    // kilo explícito — solo el total. 2.21 kg a 8 soles el kilo = 17.68.
    await registrarEntrega(
      {
        tiendaId: t.id!,
        pollos: 3,
        peso: aGramos(2.21),
        precioKg: aCentimos(7.2),
        totalDictado: aCentimos(17.68),
      },
      ctx(15, 424),
      { fecha: HOY },
    );

    const e = (await db.entregas.toArray())[0];
    // Lo que de verdad implica el total dictado: 8.00/kg, no 7.20.
    expect(e.precioKg).toBe(aCentimos(8));

    const aprendida = await db.tiendas.get(t.id!);
    expect(aprendida?.precioOffsetKg).toBe(0);
  });

  it("no mezcla dos entregas del mismo día a la misma tienda", async () => {
    const t = await crearTienda("Chifa Wong");
    const datos = { tiendaId: t.id!, pollos: 5, sinPesar: true, totalDictado: aCentimos(140) };
    await registrarEntrega(datos, ctx(1), { fecha: HOY });
    await registrarEntrega(datos, ctx(6, 620), { fecha: HOY });

    const suyas = await db.entregas.where("fecha").equals(HOY).toArray();
    expect(suyas).toHaveLength(2);
    expect((await resumenDe(HOY)).repartidoPollos).toBe(10);
  });
});

describe("pollos partidos en pecho y pierna", () => {
  /** Una jornada con stock puesto, para poder mirar lo que queda. */
  async function conStock(pollos: number, piernas: number, pechos = 0) {
    await db.jornadas.put({
      fecha: HOY,
      stockPollos: pollos,
      stockPiernas: piernas,
      stockPechos: pechos,
      horaCierre: "19:30",
      estado: "abierta",
      cajaContada: null,
      cuadro: null,
      creada: Date.now(),
      cerradaEn: null,
    });
  }

  it("un pecho gasta un pollo entero y deja una pierna suelta", async () => {
    // Parte un pollo: el pecho se lo lleva una tienda y la pierna queda para
    // otra. Del camión sale un pollo; al montón de piernas entra una.
    await conStock(120, 40);
    const t = await crearTienda("Doña Elsa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 0, pechos: 1, peso: aGramos(1.2), precioKg: aCentimos(9.5) },
      ctx(1),
      { fecha: HOY },
    );

    const r = await resumenDe(HOY);
    expect(r.restantePollos).toBe(119);
    expect(r.restantePiernas).toBe(41);
    expect(r.repartidoPechos).toBe(1);
  });

  it("vender esa pierna la devuelve a su sitio", async () => {
    await conStock(120, 40);
    const a = await crearTienda("Doña Elsa");
    const b = await crearTienda("Bodega Sarita");
    await registrarEntrega(
      { tiendaId: a.id!, pollos: 0, pechos: 1, peso: aGramos(1.2), precioKg: aCentimos(9.5) },
      ctx(1),
      { fecha: HOY },
    );
    await registrarEntrega(
      { tiendaId: b.id!, pollos: 0, piernas: 1, peso: aGramos(0.8), precioKg: aCentimos(9.5) },
      ctx(2),
      { fecha: HOY },
    );

    const r = await resumenDe(HOY);
    // El pollo partido se gastó entero y sus dos partes están vendidas.
    expect(r.restantePollos).toBe(119);
    expect(r.restantePiernas).toBe(40);
  });

  it("la presa se cobra al mismo precio por kilo que el pollo entero", async () => {
    await conStock(120, 40);
    const t = await crearTienda("Doña Elsa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 0, pechos: 1, peso: aGramos(1.24), precioKg: aCentimos(9.5) },
      ctx(1),
      { fecha: HOY },
    );
    // 1.24 kg x 9.50 = 11.78
    expect(money((await db.entregas.toArray())[0].totalCalculado)).toBe("S/ 11.78");
  });

  it("una entrega mezclada descuenta cada cosa de donde toca", async () => {
    await conStock(120, 40);
    const t = await crearTienda("Pollería El Sabor");
    await registrarEntrega(
      {
        tiendaId: t.id!,
        pollos: 10,
        pechos: 2,
        piernas: 3,
        peso: aGramos(38),
        precioKg: aCentimos(9.2),
      },
      ctx(1),
      { fecha: HOY },
    );

    const r = await resumenDe(HOY);
    expect(r.restantePollos).toBe(108); // 120 - 10 enteros - 2 partidos
    expect(r.restantePiernas).toBe(39); // 40 + 2 de los partidos - 3 vendidas
  });

  it("las entregas viejas, sin el campo, no envenenan las cuentas", async () => {
    // Las guardadas antes de que existieran los pechos no traen el campo.
    await conStock(120, 40);
    const t = await crearTienda("Bodega Milagros");
    await db.entregas.add({
      fecha: HOY,
      tiendaId: t.id!,
      orden: 1,
      minuto: 420,
      pollos: 6,
      piernas: 0,
      sinPesar: 1,
      tandas: [],
      peso: 0,
      precioKg: 0,
      totalCalculado: aCentimos(168),
      totalCobrado: 0,
      descuentoRedondeo: 0,
      estadoPago: "pendiente",
      notas: "",
      creada: Date.now(),
    } as never);

    const r = await resumenDe(HOY);
    expect(r.repartidoPechos).toBe(0);
    expect(r.restantePollos).toBe(114);
    expect(Number.isNaN(r.restantePiernas)).toBe(false);
  });

  it("entregar más piernas de las que hay deja pechos sueltos por vender", async () => {
    // Solo 2 piernas sueltas y nadie dejó pechos hoy: para armar las 5 que
    // pidieron hubo que partir 3 pollos más solo por la pierna, y de cada uno
    // quedó un pecho sin dueño todavía.
    await conStock(120, 2);
    const t = await crearTienda("Restaurante Central");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 0, piernas: 5, peso: aGramos(3.5), precioKg: aCentimos(9.5) },
      ctx(1),
      { fecha: HOY },
    );

    const r = await resumenDe(HOY);
    expect(r.pechosLibres).toBe(3);
    expect(r.restantePiernas).toBe(0);
    expect(r.restantePollos).toBe(117); // 120 - 3 partidos solo por la pierna
  });

  /*
   * El caso justo en la frontera, dictado por el dueño: los pechos que entrega
   * **agrandan** el montón de piernas, y solo cuando ese montón ya agrandado se
   * agota, la siguiente pierna empieza a dejar pechos libres. Es el punto donde
   * las dos direcciones del despiece se tocan (`piernasDisponibles` en
   * `resumenDe`), y ninguna de las dos pruebas de arriba lo cruza: una solo
   * suma piernas al montón y la otra parte de un montón que nunca creció.
   */
  it("el pecho agranda el montón de piernas, y solo al agotarlo aparece un pecho libre", async () => {
    await conStock(100, 10);
    const t = await crearTienda("Rosa");

    // Un pecho: gasta un pollo entero y deja una pierna suelta → 11 disponibles.
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 0, pechos: 1, peso: aGramos(1.2), precioKg: aCentimos(9) },
      ctx(1),
      { fecha: HOY },
    );
    const conPecho = await resumenDe(HOY);
    expect(conPecho.restantePiernas).toBe(11);
    expect(conPecho.restantePollos).toBe(99);
    expect(conPecho.pechosLibres).toBe(0);

    // Se entregan esas 11 justas: el montón queda en cero, sin partir de más.
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 0, piernas: 11, peso: aGramos(7.7), precioKg: aCentimos(9) },
      ctx(2),
      { fecha: HOY },
    );
    const justo = await resumenDe(HOY);
    expect(justo.restantePiernas).toBe(0);
    expect(justo.pechosLibres).toBe(0);
    expect(justo.restantePollos).toBe(99);

    // Y una pierna más, ya sin sueltas: solo pudo salir de partir otro pollo
    // entero, y ese deja su pecho sin vender.
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 0, piernas: 1, peso: aGramos(0.7), precioKg: aCentimos(9) },
      ctx(3),
      { fecha: HOY },
    );
    const cruzando = await resumenDe(HOY);
    expect(cruzando.pechosLibres).toBe(1);
    expect(cruzando.restantePiernas).toBe(0);
    expect(cruzando.restantePollos).toBe(98);
  });
});

describe("pechos comprados sueltos (stockPechos)", () => {
  async function conStock(pollos: number, piernas: number, pechos: number) {
    await db.jornadas.put({
      fecha: HOY,
      stockPollos: pollos,
      stockPiernas: piernas,
      stockPechos: pechos,
      horaCierre: "19:30",
      estado: "abierta",
      cajaContada: null,
      cuadro: null,
      creada: Date.now(),
      cerradaEn: null,
    });
  }

  it("entregar un pecho comprado suelto no toca el stock de pollos ni suma una pierna", async () => {
    // Caso reportado por el dueño: le compró 2 pechos a otro repartidor
    // porque le faltó mercadería. Entregar esos 2 no debería romper ningún
    // pollo propio ni inflar el montón de piernas por vender.
    await conStock(120, 18, 2);
    const t = await crearTienda("Julieta");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 0, pechos: 2, peso: aGramos(4.49), precioKg: aCentimos(8) },
      ctx(1),
      { fecha: HOY },
    );

    const r = await resumenDe(HOY);
    expect(r.restantePollos).toBe(120); // ningún pollo propio se partió
    expect(r.restantePiernas).toBe(18); // el montón de piernas no se movió
    expect(r.pechosLibres).toBe(0); // los 2 comprados ya se entregaron
  });

  it("entregar más pechos de los comprados sueltos rompe pollos propios por el resto", async () => {
    // Compró 2 pechos sueltos pero entregó 5: los 3 de más solo pudieron
    // salir de partir 3 pollos propios, y cada uno deja una pierna suelta.
    await conStock(120, 18, 2);
    const t = await crearTienda("Julieta");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 0, pechos: 5, peso: aGramos(9), precioKg: aCentimos(8) },
      ctx(1),
      { fecha: HOY },
    );

    const r = await resumenDe(HOY);
    expect(r.restantePollos).toBe(117); // 120 - 3 partidos por el resto de pechos
    expect(r.restantePiernas).toBe(21); // 18 + 3 piernas sueltas de esos partidos
    expect(r.pechosLibres).toBe(0);
  });

  it("pechos comprados sueltos y sin entregar quedan como pechosLibres", async () => {
    await conStock(120, 18, 5);
    const r = await resumenDe(HOY);
    expect(r.pechosLibres).toBe(5);
    expect(r.restantePollos).toBe(120);
  });
});

describe("corregir a mano una entrega", () => {
  it("una sola pesada se escribe directa, sin crear tandas", async () => {
    const t = await crearTienda("Juan");
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, peso: aGramos(2.85), precioKg: aCentimos(5.5) },
      ctx(1),
      { fecha: HOY },
    );

    await fijarPeso(id, aGramos(6.24));
    const e = (await db.entregas.get(id))!;
    expect(e.peso).toBe(6240);
    // Sin tandas: no se inventa una «Primera tanda» para una sola pesada.
    expect(e.tandas).toEqual([]);
    // 6.24 x 5.50 = 34.32
    expect(money(e.totalCalculado)).toBe("S/ 34.32");
  });

  it("cambiar el precio no borra un peso que vino sin tandas", async () => {
    // Este era el fallo: la entrega se dictó con un peso suelto y al tocar el
    // precio se recalculaba el peso desde una lista de tandas vacía → 0.
    const t = await crearTienda("Juan");
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, peso: aGramos(12.75), precioKg: aCentimos(9.3) },
      ctx(1),
      { fecha: HOY },
    );
    expect(money((await db.entregas.get(id))!.totalCalculado)).toBe("S/ 118.58");

    await editarEntrega(id, { precioKg: aCentimos(10) });
    const e = (await db.entregas.get(id))!;
    expect(e.peso).toBe(12750);
    expect(money(e.totalCalculado)).toBe("S/ 127.50");
  });

  it("una entrega sin pesar queda pendiente, no pagada", async () => {
    // Con total 0, `0 >= 0` la pintaba de verde como si ya hubiera cobrado.
    const t = await crearTienda("Doña Elsa");
    const id = await registrarEntrega({ tiendaId: t.id!, pollos: 4 }, ctx(1), { fecha: HOY });
    const e = (await db.entregas.get(id))!;
    expect(e.totalCalculado).toBe(0);
    expect(e.estadoPago).toBe("pendiente");
  });

  it("fijar el total recalcula el precio por kilo para que cuadre", async () => {
    const t = await crearTienda("Juan");
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, peso: aGramos(7.2), precioKg: aCentimos(5.5) },
      ctx(1),
      { fecha: HOY },
    );

    await fijarTotal(id, aCentimos(40));
    const e = (await db.entregas.get(id))!;
    expect(money(e.totalCalculado)).toBe("S/ 40.00");
    // 40 / 7.2 kg = 5.5555… -> 5.56 el kilo
    expect(e.precioKg).toBe(556);
  });

  it("sin peso, fijar el total no toca el precio", async () => {
    // El caso de trato cerrado: no hay kilos que repartir.
    const t = await crearTienda("Chifa Wong");
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 10, sinPesar: true, totalDictado: aCentimos(320) },
      ctx(1),
      { fecha: HOY },
    );

    await fijarTotal(id, aCentimos(300));
    const e = (await db.entregas.get(id))!;
    expect(money(e.totalCalculado)).toBe("S/ 300.00");
    expect(e.precioKg).toBe(0);
  });

  it("cambiar el total ajusta el estado de pago", async () => {
    const t = await crearTienda("Juan");
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, sinPesar: true, totalDictado: aCentimos(100) },
      ctx(1),
      { fecha: HOY },
    );
    await registrarCobro(t.id!, aCentimos(60), { fecha: HOY });

    // Le bajo el total a lo que ya pagó: queda saldada.
    await fijarTotal(id, aCentimos(60));
    expect((await db.entregas.get(id))!.estadoPago).toBe("pagado");
    expect(await cuentasPendientes(HOY)).toHaveLength(0);
  });
});

describe("clientes con el mismo nombre", () => {
  it("al segundo Juan se le pone un número", async () => {
    // Si los dos se llaman igual en la pantalla, se le paga al que no era.
    const a = await crearTienda("Juan");
    const b = await crearTienda("Juan");
    const c = await crearTienda("Juan");
    expect([a.nombre, b.nombre, c.nombre]).toEqual(["Juan", "Juan 2", "Juan 3"]);
  });

  it("cobrarle a uno no toca la cuenta del otro", async () => {
    const a = await crearTienda("Juan");
    const b = await crearTienda("Juan");
    for (const t of [a, b]) {
      await registrarEntrega(
        { tiendaId: t.id!, pollos: 5, sinPesar: true, totalDictado: aCentimos(100) },
        ctx(1),
        { fecha: HOY },
      );
    }

    await registrarCobro(a.id!, aCentimos(100), { fecha: HOY });

    const cuentas = await cuentasPendientes(HOY);
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0].tienda.nombre).toBe("Juan 2");
    expect(money(cuentas[0].total)).toBe("S/ 100.00");
  });
});

describe("deudas que se arrastran solas", () => {
  it("un día que quedó abierto se cierra al abrir la app", async () => {
    // Si no cerrara solo, lo que no cobró ayer nunca pasaría a deuda y hoy no
    // aparecería en Cobranza: la plata se vuelve invisible.
    const t = await crearTienda("Doña Elsa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 7, sinPesar: true, totalDictado: aCentimos(218.88) },
      ctx(1),
      { fecha: AYER },
    );

    await cerrarDiasPasados(HOY);

    const cuentas = await cuentasPendientes(HOY);
    expect(cuentas).toHaveLength(1);
    expect(money(cuentas[0].deuda)).toBe("S/ 218.88");
    expect(cuentas[0].deudaDesde).toBe(AYER);
  });

  it("no toca el día de hoy, que lo cierra él al cuadrar caja", async () => {
    const t = await crearTienda("Juan");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, sinPesar: true, totalDictado: aCentimos(100) },
      ctx(1),
      { fecha: HOY },
    );

    await cerrarDiasPasados(HOY);

    expect((await db.jornadas.get(HOY))?.estado ?? "abierta").toBe("abierta");
    expect(await db.deudas.count()).toBe(0);
  });

  it("una deuda apuntada a mano aparece en la cobranza", async () => {
    const t = await crearTienda("Bodega Sarita");
    await agregarDeuda(t.id!, aCentimos(45), AYER);

    const cuentas = await cuentasPendientes(HOY);
    expect(money(cuentas[0].total)).toBe("S/ 45.00");
  });
});

describe("cobrar", () => {
  it("paga primero la deuda vieja y luego lo de hoy", async () => {
    const t = await crearTienda("Don Julio Ramírez");
    await db.deudas.add({
      tiendaId: t.id!,
      entregaId: null,
      fechaOrigen: AYER,
      monto: aCentimos(30),
      saldado: 0,
      cerrada: 0,
      creada: Date.now(),
    });
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 8, peso: aGramos(26.2), precioKg: aCentimos(9.5) },
      ctx(2),
      { fecha: HOY },
    );

    await registrarCobro(t.id!, aCentimos(50), { fecha: HOY });

    // 30 fueron a la deuda, 20 a lo de hoy.
    expect((await db.deudas.toArray())[0].cerrada).toBe(1);
    const e = (await db.entregas.toArray())[0];
    expect(money(e.totalCobrado)).toBe("S/ 20.00");
    expect(e.estadoPago).toBe("parcial");
  });

  it("cobrar todo deja la cuenta fuera de la lista de cobranza", async () => {
    const t = await crearTienda("Sra. Rosa Quispe");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, sinPesar: true, totalDictado: aCentimos(42) },
      ctx(3),
      { fecha: HOY },
    );

    expect(await cuentasPendientes(HOY)).toHaveLength(1);
    await registrarCobro(t.id!, aCentimos(42), { fecha: HOY });
    expect(await cuentasPendientes(HOY)).toHaveLength(0);
  });

  it("cuentasDelDia trae todas las tiendas de la ruta, entregadas o no, en orden ascendente", async () => {
    // La vista Ruta de Cobranza refleja Hoy Ruta: **todas** las tiendas,
    // en el mismo orden (primera parada primero), las cobradas se quedan
    // marcadas en su sitio y las sin actividad también aparecen.
    const primera = await crearTienda("Bodega Milagros");
    const segunda = await crearTienda("Doña Elsa");
    const sinVisita = await crearTienda("Sin Visitar");
    await registrarEntrega(
      { tiendaId: segunda.id!, pollos: 7, sinPesar: true, totalDictado: aCentimos(218.88) },
      ctx(7),
      { fecha: HOY },
    );
    await registrarEntrega(
      { tiendaId: primera.id!, pollos: 6, sinPesar: true, totalDictado: aCentimos(168) },
      ctx(3),
      { fecha: HOY },
    );
    await registrarCobro(primera.id!, aCentimos(168), { fecha: HOY });

    const ruta = await cuentasDelDia(HOY);
    // Las tres tiendas, la sin actividad incluida.
    expect(ruta).toHaveLength(3);
    // Orden ascendente: parada 3, parada 7, y la sin ruta al final.
    expect(ruta.map((c) => c.tienda.id)).toEqual([primera.id, segunda.id, sinVisita.id]);
    expect(ruta[0].pagada).toBe(true); // primera saldada
    expect(ruta[1].pagada).toBe(false); // segunda pendiente
    expect(ruta[2].pagada).toBe(true); // sin visitar: nada que cobrar
    expect(ruta[2].entregas).toHaveLength(0);
  });

  it("una entrega confirmada sin precio sigue en cobranza aunque no se haya marcado 'sin pesar'", async () => {
    // La tarjeta deja confirmar sin poner el total todavía (queda
    // "incompleto"): sin peso, sin precio por kilo, sin total dictado y sin
    // marcar `sinPesar`. Antes del arreglo, esto desaparecía de Cobranza
    // igual que una entrega sin pesar de verdad.
    const t = await crearTienda("Chifa Wong");
    await registrarEntrega({ tiendaId: t.id!, pollos: 10 }, ctx(8), { fecha: HOY });

    const cuentas = await cuentasPendientes(HOY);
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0].tieneSinPesar).toBe(true);
    expect(cuentas[0].total).toBe(0);
  });

  it("cobrar le pone precio a una entrega sin precio aunque no se haya marcado 'sin pesar'", async () => {
    const t = await crearTienda("Chifa Wong");
    await registrarEntrega({ tiendaId: t.id!, pollos: 10 }, ctx(8), { fecha: HOY });

    await registrarCobro(t.id!, aCentimos(320), { fecha: HOY });

    const e = (await db.entregas.toArray())[0];
    expect(money(e.totalCalculado)).toBe("S/ 320.00");
    expect(money(e.totalCobrado)).toBe("S/ 320.00");
    expect(e.estadoPago).toBe("pagado");
    expect(await cuentasPendientes(HOY)).toHaveLength(0);
  });

  it("registra el redondeo como descuento, sin tocar el total calculado", async () => {
    // La cuenta es 56.90 y le dan 56.50 (plan §3.5).
    const t = await crearTienda("Bodega Sarita");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 2, sinPesar: true, totalDictado: aCentimos(56.9) },
      ctx(6),
      { fecha: HOY },
    );

    await registrarCobro(t.id!, aCentimos(56.5), { fecha: HOY, aceptarRedondeo: true });

    const e = (await db.entregas.toArray())[0];
    expect(money(e.totalCalculado)).toBe("S/ 56.90"); // el cálculo exacto vive
    expect(money(e.totalCobrado)).toBe("S/ 56.50");
    expect(money(e.descuentoRedondeo)).toBe("S/ 0.40");
    expect(e.estadoPago).toBe("pagado");
    expect(await cuentasPendientes(HOY)).toHaveLength(0);
  });

  it("sin aceptar el redondeo, los 0.40 quedan como deuda", async () => {
    const t = await crearTienda("Bodega Sarita");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 2, sinPesar: true, totalDictado: aCentimos(56.9) },
      ctx(6),
      { fecha: HOY },
    );

    await registrarCobro(t.id!, aCentimos(56.5), { fecha: HOY });

    const e = (await db.entregas.toArray())[0];
    expect(e.descuentoRedondeo).toBe(0);
    expect(e.estadoPago).toBe("parcial");
    expect(money((await cuentasPendientes(HOY))[0].total)).toBe("S/ 0.40");
  });

  it("el redondeo también se perdona cuando cae en deuda vieja pura, sin entregas hoy", async () => {
    // Pasa por una tienda solo a cobrar lo de antes, sin dejarle nada hoy.
    const t = await crearTienda("Restaurante Central");
    await db.deudas.add({
      tiendaId: t.id!,
      entregaId: null,
      fechaOrigen: AYER,
      monto: aCentimos(50),
      saldado: 0,
      cerrada: 0,
      creada: Date.now(),
    });

    await registrarCobro(t.id!, aCentimos(49.6), { fecha: HOY, aceptarRedondeo: true });

    // Antes, el perdón solo se buscaba entre las entregas de hoy: como no
    // había ninguna, los 0.40 no se aplicaban en ningún lado y la deuda
    // quedaba abierta para siempre por una fracción de sol.
    const deuda = (await db.deudas.toArray())[0];
    expect(deuda.cerrada).toBe(1);
    expect(await cuentasPendientes(HOY)).toHaveLength(0);
  });

  it("no perdona como redondeo lo que es una deuda de verdad", async () => {
    const t = await crearTienda("Doña Elsa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 9, sinPesar: true, totalDictado: aCentimos(218.88) },
      ctx(7),
      { fecha: HOY },
    );

    // Le dio 100 de 218.88. Aunque se pida aceptar el redondeo, 118.88 no lo es.
    await registrarCobro(t.id!, aCentimos(100), { fecha: HOY, aceptarRedondeo: true });

    const e = (await db.entregas.toArray())[0];
    expect(e.descuentoRedondeo).toBe(0);
    // A cobrar va redondeado hacia abajo a los 10 céntimos: no hay monedas
    // de 8 céntimos con las que pagar los 118.88 exactos.
    expect(money((await cuentasPendientes(HOY))[0].total)).toBe("S/ 118.80");
  });

  it("un pago de más no cobra más de lo que se debe", async () => {
    const t = await crearTienda("Bodega Milagros");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 6, sinPesar: true, totalDictado: aCentimos(168) },
      ctx(1),
      { fecha: HOY },
    );

    await registrarCobro(t.id!, aCentimos(200), { fecha: HOY });
    const e = (await db.entregas.toArray())[0];
    expect(money(e.totalCobrado)).toBe("S/ 168.00");
  });

  it("cobra del último al primero, que es como vuelve", async () => {
    // Reparte de ida y cobra de vuelta: la última tienda a la que le dejó es
    // la primera que se reencuentra.
    const primera = await crearTienda("Bodega Milagros");
    const media = await crearTienda("Sra. Rosa Quispe");
    const ultima = await crearTienda("Doña Elsa");
    const dejar = (t: { id?: number }, parada: number, minuto: number) =>
      registrarEntrega(
        { tiendaId: t.id!, pollos: 5, sinPesar: true, totalDictado: aCentimos(100) },
        ctx(parada, minuto),
        { fecha: HOY },
      );
    await dejar(primera, 1, 380);
    await dejar(media, 2, 500);
    await dejar(ultima, 3, 640);

    const retorno = await cuentasPendientes(HOY);
    expect(retorno.map((c) => c.tienda.nombre)).toEqual([
      "Doña Elsa",
      "Sra. Rosa Quispe",
      "Bodega Milagros",
    ]);

    // Y el conmutador devuelve el orden de reparto.
    const ruta = await cuentasPendientes(HOY, "ruta");
    expect(ruta.map((c) => c.tienda.nombre)).toEqual([
      "Bodega Milagros",
      "Sra. Rosa Quispe",
      "Doña Elsa",
    ]);
  });

  it("las tiendas sin parada aprendida quedan al final en los dos órdenes", async () => {
    const conocida = await crearTienda("Doña Elsa");
    const nueva = await crearTienda("Cliente nuevo");
    await registrarEntrega(
      { tiendaId: conocida.id!, pollos: 5, sinPesar: true, totalDictado: aCentimos(100) },
      ctx(3, 640),
      { fecha: HOY },
    );
    // Deuda suelta, sin entrega: nunca aprendió su parada.
    await agregarDeuda(nueva.id!, aCentimos(50), AYER);

    for (const orden of ["retorno", "ruta"] as const) {
      const cuentas = await cuentasPendientes(HOY, orden);
      expect(cuentas[cuentas.length - 1].tienda.nombre).toBe("Cliente nuevo");
    }
  });

  it("ordena la cobranza por la ruta aprendida", async () => {
    const tarde = await crearTienda("Doña Elsa");
    const temprano = await crearTienda("Bodega Milagros");
    await registrarEntrega(
      { tiendaId: tarde.id!, pollos: 7, sinPesar: true, totalDictado: aCentimos(100) },
      ctx(7, 640),
      { fecha: HOY },
    );
    await registrarEntrega(
      { tiendaId: temprano.id!, pollos: 6, sinPesar: true, totalDictado: aCentimos(168) },
      ctx(1, 380),
      { fecha: HOY },
    );

    const cuentas = await cuentasPendientes(HOY, "ruta");
    expect(cuentas.map((c) => c.tienda.nombre)).toEqual(["Bodega Milagros", "Doña Elsa"]);
  });
});

describe("orden de cobranza: los abonos parciales bajan al final", () => {
  it("una cuenta con abono parcial se va al fondo y sube la siguiente", async () => {
    const a = await crearTienda("Primero");
    const b = await crearTienda("Ultimo");
    await registrarEntrega(
      { tiendaId: a.id!, pollos: 2, tandas: [aGramos(5)], precioKg: aCentimos(9) },
      ctx(1),
      { fecha: HOY },
    );
    await registrarEntrega(
      { tiendaId: b.id!, pollos: 2, tandas: [aGramos(5)], precioKg: aCentimos(9) },
      ctx(2),
      { fecha: HOY },
    );

    // «Del último»: la parada 2 (Ultimo) va primero, como cuando vuelve.
    let cuentas = await cuentasPendientes(HOY, "retorno");
    expect(cuentas.map((c) => c.tienda.nombre)).toEqual(["Ultimo", "Primero"]);

    // Ultimo paga solo una parte (45 de cuenta, le da 20): queda debiendo.
    await registrarCobro(b.id!, aCentimos(20), { fecha: HOY });

    cuentas = await cuentasPendientes(HOY, "retorno");
    // Ya abonado, se hunde al final aunque por ruta iría primero; Primero sube.
    expect(cuentas.map((c) => c.tienda.nombre)).toEqual(["Primero", "Ultimo"]);
    expect(cuentas.find((c) => c.tienda.nombre === "Ultimo")!.tocada).toBe(true);
    expect(cuentas.find((c) => c.tienda.nombre === "Primero")!.tocada).toBe(false);
  });
});

describe("agregar tandas de peso a una entrega", () => {
  it("una entrega de una sola pesada conserva ese peso como primera tanda", async () => {
    // El caso del bug: se registró con `peso` y sin `tandas` (lo más común).
    const t = await crearTienda("Peso suelto");
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 3, peso: aGramos(8), precioKg: aCentimos(9) },
      ctx(1),
      { fecha: HOY },
    );
    let e = await db.entregas.get(id);
    expect(e!.tandas).toEqual([]);
    expect(e!.peso).toBe(aGramos(8));

    // Al agregar una segunda pesada, la de 8 kg NO se pierde: queda de primera.
    await agregarTanda(id, aGramos(3));

    e = await db.entregas.get(id);
    expect(e!.tandas).toEqual([aGramos(8), aGramos(3)]);
    expect(e!.peso).toBe(aGramos(11));
    // Total recalculado sobre los 11 kg, no sobre los 3 de la tanda nueva.
    expect(money(e!.totalCalculado)).toBe("S/ 99.00");
  });

  it("cuando ya hay tandas, solo se añade la nueva al final", async () => {
    const t = await crearTienda("Con tandas");
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 2, tandas: [aGramos(5), aGramos(4)], precioKg: aCentimos(9) },
      ctx(1),
      { fecha: HOY },
    );
    await agregarTanda(id, aGramos(3));
    const e = await db.entregas.get(id);
    expect(e!.tandas).toEqual([aGramos(5), aGramos(4), aGramos(3)]);
    expect(e!.peso).toBe(aGramos(12));
  });

  it("sin peso previo, la primera tanda arranca la lista normal", async () => {
    const t = await crearTienda("Sin peso");
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 1, sinPesar: true, totalDictado: aCentimos(40) },
      ctx(1),
      { fecha: HOY },
    );
    await agregarTanda(id, aGramos(6));
    const e = await db.entregas.get(id);
    expect(e!.tandas).toEqual([aGramos(6)]);
    expect(e!.peso).toBe(aGramos(6));
  });
});

describe("migajas de redondeo por debajo de la moneda", () => {
  it("«me pagó todo» perdona el resto por debajo de la moneda y no lo deja como deuda", async () => {
    // 5 kg a 9.01 el kilo = 45.05. En monedas solo se pueden cobrar 45.00,
    // y los 5 céntimos que sobran no los cubre ninguna moneda: son el redondeo
    // a favor del cliente que el modelo ya da por perdonado.
    const t = await crearTienda("Restaurante");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, peso: aGramos(5), precioKg: aCentimos(9.01) },
      ctx(1),
      { fecha: HOY },
    );

    const [c] = await cuentasPendientes(HOY);
    expect(money(c.total)).toBe("S/ 45.00");

    // Es exactamente lo que hace el botón «Me pagó todo»: cobra c.total
    // (ya redondeado) aceptando el redondeo.
    await registrarCobro(t.id!, c.total, { fecha: HOY, aceptarRedondeo: true });

    const e = (await db.entregas.toArray())[0];
    expect(money(e.totalCalculado)).toBe("S/ 45.05"); // el cálculo exacto vive
    expect(money(e.totalCobrado)).toBe("S/ 45.00");
    expect(money(e.descuentoRedondeo)).toBe("S/ 0.05");
    expect(e.estadoPago).toBe("pagado");
    expect(await cuentasPendientes(HOY)).toHaveLength(0);

    // Y al cerrar el día no nace ninguna deuda de 5 céntimos que reaparezca
    // mañana con «A cobrar S/ 0.00».
    await cerrarDia(HOY, null, null);
    expect(await db.deudas.toArray()).toHaveLength(0);
  });

  it("una deuda por debajo de una moneda no aparece en cobranza: no hay nada que cobrar", async () => {
    const t = await crearTienda("Julia Pariahuanca");
    await db.deudas.add({
      tiendaId: t.id!,
      entregaId: null,
      fechaOrigen: AYER,
      monto: 4, // S/ 0.04
      saldado: 0,
      cerrada: 0,
      creada: Date.now(),
    });

    // aCobrar la baja a S/ 0.00: cobrarla no haría nada, así que no se lista.
    expect(await cuentasPendientes(HOY)).toHaveLength(0);
  });

  it("varias migajas que juntas sí llegan a una moneda sí se cobran", async () => {
    const t = await crearTienda("Bodega Sarita");
    for (let i = 0; i < 3; i++) {
      await db.deudas.add({
        tiendaId: t.id!,
        entregaId: null,
        fechaOrigen: AYER,
        monto: 4, // tres de 4 = 12 céntimos
        saldado: 0,
        cerrada: 0,
        creada: Date.now(),
      });
    }

    // El umbral mira el saldo entero, no cada deuda suelta: 12 céntimos sí dan
    // una moneda de 10.
    const cuentas = await cuentasPendientes(HOY);
    expect(cuentas).toHaveLength(1);
    expect(money(cuentas[0].total)).toBe("S/ 0.10");
  });

  it("al cerrar, un resto que ninguna moneda cubre se perdona en vez de quedar como deuda", async () => {
    /*
     * 5 kg a 9.01 = 45.05, y le cobra los 45.00 que sí se pueden contar, pero
     * **sin** marcar el redondeo (le pagó y ya). Los 5 céntimos que sobran no
     * los cubre ninguna moneda: al cerrar no pueden volverse una deuda de
     * S/ 0.05 con un «Cobrar aquí» que no hace nada.
     */
    const t = await crearTienda("Ayde");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 3, peso: aGramos(5), precioKg: aCentimos(9.01) },
      ctx(1),
      { fecha: HOY },
    );
    await registrarCobro(t.id!, aCentimos(45), { fecha: HOY });

    await cerrarDia(HOY, null, null);

    expect(await db.deudas.toArray()).toHaveLength(0);
    const e = (await db.entregas.toArray())[0];
    expect(money(e.descuentoRedondeo)).toBe("S/ 0.05");
    expect(e.estadoPago).toBe("pagado");
  });

  it("limpiarMigajas cierra las deudas viejas que ya no se pueden cobrar", async () => {
    // Las que nacieron antes del arreglo de arriba y se quedaron colgadas.
    const t = await crearTienda("Ayde");
    await agregarDeuda(t.id!, 5, AYER);

    expect(await limpiarMigajas()).toBe(1);
    expect((await db.deudas.toArray())[0].cerrada).toBe(1);
    expect(await cuentasPendientes(HOY)).toHaveLength(0);
  });

  it("limpiarMigajas no toca las que juntas sí llegan a una moneda", async () => {
    const t = await crearTienda("Bodega Sarita");
    for (let i = 0; i < 3; i++) await agregarDeuda(t.id!, 4, AYER);

    expect(await limpiarMigajas()).toBe(0);
    expect(await cuentasPendientes(HOY)).toHaveLength(1);
  });
});

describe("aprender el precio de la tienda al corregirlo a mano", () => {
  it("corregir el precio por kilo en el Detalle actualiza la diferencia de la tienda", async () => {
    /*
     * El caso real de Chela: su diferencia se aprendió cuando el base era
     * 8.80 y le cobraba 8.50 (−0.30). El base bajó a 8.00, así que la tarjeta
     * le propone 7.70 — pero de verdad le cobra 7.00, y lo corrige en el
     * Detalle. Antes la entrega quedaba bien y la tienda no se enteraba: al
     * día siguiente volvía a proponer 7.70.
     */
    await guardarStock(HOY, 40, 4, aCentimos(8));
    const t = await crearTienda("Chela", { precioKgDefecto: aCentimos(8.5) });
    await db.tiendas.update(t.id!, { precioOffsetKg: -aCentimos(0.3) });

    // Acepta la sugerencia (7.70): no hay nada nuevo que aprender todavía.
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 3, peso: aGramos(8.4), precioKg: aCentimos(7.7) },
      ctx(3),
      { fecha: HOY },
    );
    expect((await db.tiendas.get(t.id!))?.precioOffsetKg).toBe(-aCentimos(0.3));

    const e = (await db.entregas.toArray())[0];
    await editarEntrega(e.id!, { precioKg: aCentimos(7) });

    const aprendida = await db.tiendas.get(t.id!);
    expect(aprendida?.precioKgDefecto).toBe(aCentimos(7));
    // 7.00 − 8.00 de base = −1.00, y con el mismo base mañana propone 7.00.
    expect(aprendida?.precioOffsetKg).toBe(-aCentimos(1));
    expect(precioEfectivoKg(aprendida, aCentimos(8))).toBe(aCentimos(7));
  });

  it("corregir el precio no vuelve a contar la parada en la ruta", async () => {
    await guardarStock(HOY, 40, 4, aCentimos(8));
    const t = await crearTienda("Marina");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 2, peso: aGramos(5), precioKg: aCentimos(8) },
      ctx(7, 430),
      { fecha: HOY },
    );
    const antes = await db.tiendas.get(t.id!);

    const e = (await db.entregas.toArray())[0];
    await editarEntrega(e.id!, { precioKg: aCentimos(7.4) });

    const despues = await db.tiendas.get(t.id!);
    expect(despues?.precioKgDefecto).toBe(aCentimos(7.4));
    // La hora, la parada y las veces vistas se quedan como estaban: esa
    // entrega ya las aportó al registrarse, y contarlas dos veces torcería
    // la correlación de §6.
    expect(despues?.minutos).toEqual(antes?.minutos);
    expect(despues?.posiciones).toEqual(antes?.posiciones);
    expect(despues?.vistas).toBe(antes?.vistas);
  });

  it("poner el total a mano también enseña el precio por kilo que salió", async () => {
    await guardarStock(HOY, 40, 4, aCentimos(8));
    const t = await crearTienda("Olga", { precioKgDefecto: aCentimos(8) });
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 3, peso: aGramos(2.21), precioKg: aCentimos(8) },
      ctx(15),
      { fecha: HOY },
    );

    // «Son 15.47 soles» sobre 2.21 kg = 7.00 el kilo.
    const e = (await db.entregas.toArray())[0];
    await fijarTotal(e.id!, aCentimos(15.47));

    const aprendida = await db.tiendas.get(t.id!);
    expect(aprendida?.precioKgDefecto).toBe(aCentimos(7));
    expect(aprendida?.precioOffsetKg).toBe(-aCentimos(1));
  });
});

describe("cerrar el día", () => {
  it("lo que quedó sin cobrar pasa a deuda de la tienda", async () => {
    const t = await crearTienda("Don Julio Ramírez");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 8, peso: aGramos(26.2), precioKg: aCentimos(9.5) },
      ctx(2),
      { fecha: HOY },
    );
    await registrarCobro(t.id!, aCentimos(200), { fecha: HOY });

    await cerrarDia(HOY, aCentimos(200), true);

    const deudas = await db.deudas.toArray();
    expect(deudas).toHaveLength(1);
    expect(money(deudas[0].monto)).toBe("S/ 48.90");
    expect(deudas[0].fechaOrigen).toBe(HOY);
    expect((await db.jornadas.get(HOY))?.estado).toBe("cerrada");
  });

  it("cerrar dos veces no duplica las deudas", async () => {
    // Si esto fallara, el repartidor vería a sus clientes debiendo el doble
    // sin haber hecho nada.
    const t = await crearTienda("Doña Elsa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 7, sinPesar: true, totalDictado: aCentimos(218.88) },
      ctx(7),
      { fecha: HOY },
    );

    await cerrarDia(HOY, 0, true);
    await cerrarDia(HOY, 0, true);

    const deudas = await db.deudas.toArray();
    expect(deudas).toHaveLength(1);
    expect(money(deudas[0].monto)).toBe("S/ 218.88");
  });

  it("lo que pasó a deuda no se sigue contando como saldo del día", async () => {
    // Si no, el «por cobrar» del encabezado enseña el doble de lo que es:
    // una vez como saldo de la entrega y otra como deuda recién creada.
    const t = await crearTienda("Doña Elsa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 7, sinPesar: true, totalDictado: aCentimos(218.88) },
      ctx(7),
      { fecha: HOY },
    );

    expect(money((await resumenDe(HOY)).porCobrarDelDia)).toBe("S/ 218.88");
    await cerrarDia(HOY, 0, true);

    expect((await resumenDe(HOY)).porCobrarDelDia).toBe(0);
    const cuentas = await cuentasPendientes(HOY);
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0].delDia).toBe(0);
    expect(money(cuentas[0].deuda)).toBe("S/ 218.88");
    // Lo que se le pide pagar va a la moneda más pequeña que existe.
    expect(money(cuentas[0].total)).toBe("S/ 218.80");
  });

  it("una entrega saldada con redondeo no genera deuda", async () => {
    const t = await crearTienda("Bodega Sarita");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 2, sinPesar: true, totalDictado: aCentimos(56.9) },
      ctx(6),
      { fecha: HOY },
    );
    await registrarCobro(t.id!, aCentimos(56.5), { fecha: HOY, aceptarRedondeo: true });

    await cerrarDia(HOY, aCentimos(56.5), true);
    expect(await db.deudas.toArray()).toHaveLength(0);
  });

  it("el resumen del día cuadra con la caja", async () => {
    const a = await crearTienda("Bodega Milagros");
    const b = await crearTienda("Sra. Rosa Quispe");
    await db.jornadas.put({
      fecha: HOY,
      stockPollos: 120,
      stockPiernas: 40,
stockPechos: 0,
      horaCierre: "19:30",
      estado: "abierta",
      cajaContada: null,
      cuadro: null,
      creada: Date.now(),
      cerradaEn: null,
    });

    await registrarEntrega(
      { tiendaId: a.id!, pollos: 6, sinPesar: true, totalDictado: aCentimos(168) },
      ctx(1),
      { fecha: HOY },
    );
    await registrarEntrega(
      { tiendaId: b.id!, pollos: 5, piernas: 6, sinPesar: true, totalDictado: aCentimos(42) },
      ctx(2),
      { fecha: HOY },
    );
    await registrarCobro(a.id!, aCentimos(168), { fecha: HOY });

    const r = await resumenDe(HOY);
    expect(r.repartidoPollos).toBe(11);
    expect(r.restantePollos).toBe(109);
    expect(r.restantePiernas).toBe(34);
    expect(money(r.cobrado)).toBe("S/ 168.00");
    expect(money(r.porCobrarDelDia)).toBe("S/ 42.00");
    expect(r.tiendas).toBe(2);
  });
});

describe("corregir una entrega de un día ya cerrado", () => {
  /** Entrega 10 kg a 5.00/kg = S/ 50, y el día se cierra. */
  async function jornadaCerrada(cobrado: number) {
    await guardarStock(HOY, 100, 0, aCentimos(5));
    const t = await crearTienda("Doña Elsa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: HOY },
    );
    const e = (await db.entregas.where("fecha").equals(HOY).toArray())[0];
    if (cobrado > 0) await registrarCobro(t.id!, aCentimos(cobrado), { fecha: HOY });
    await cerrarDia(HOY, null, null);
    return { t, e };
  }

  const debe = async (tiendaId: number) =>
    (await db.deudas.where("tiendaId").equals(tiendaId).toArray())
      .filter((d) => !d.cerrada)
      .reduce((a, d) => a + (d.monto - d.saldado), 0);

  /**
   * El fallo: la plata se evaporaba. Al cerrar, lo que falta pasa a `deudas` y
   * la entrega deja de contar como saldo del día; corregir después subía el
   * total y nadie se enteraba.
   */
  it("le cobré de menos y ya lo había cobrado todo: la diferencia queda por cobrar", async () => {
    const { t, e } = await jornadaCerrada(50);
    expect(await debe(t.id!)).toBe(0);

    // Eran 6.00/kg, no 5.00.
    await editarEntrega(e.id!, { precioKg: aCentimos(6) });

    expect(money(await debe(t.id!))).toBe("S/ 10.00");
    const pend = await cuentasPendientes("2026-08-08");
    expect(pend.find((c) => c.tienda.id === t.id)?.total).toBe(aCentimos(10));
  });

  it("corregir hacia arriba con la deuda a medio pagar suma la diferencia, sin resucitar lo pagado", async () => {
    const { t, e } = await jornadaCerrada(20); // quedó debiendo 30
    expect(money(await debe(t.id!))).toBe("S/ 30.00");
    await registrarCobro(t.id!, aCentimos(30), { fecha: "2026-08-08" }); // salda la deuda
    expect(await debe(t.id!)).toBe(0);

    await editarEntrega(e.id!, { precioKg: aCentimos(6) }); // +10
    // Solo los 10 nuevos: lo ya pagado no vuelve.
    expect(money(await debe(t.id!))).toBe("S/ 10.00");
  });

  it("corregir hacia abajo reduce lo que debe", async () => {
    const { t, e } = await jornadaCerrada(0); // debe los 50
    expect(money(await debe(t.id!))).toBe("S/ 50.00");
    await editarEntrega(e.id!, { precioKg: aCentimos(4) }); // 40
    expect(money(await debe(t.id!))).toBe("S/ 40.00");
  });

  it("corregir tan abajo que le cobró de más no deja una deuda negativa", async () => {
    const { t, e } = await jornadaCerrada(50);
    await editarEntrega(e.id!, { precioKg: aCentimos(3) }); // 30, ya le pagó 50
    expect(await debe(t.id!)).toBe(0);
  });

  it("una diferencia por debajo de la moneda se perdona, no crea una migaja", async () => {
    const { t, e } = await jornadaCerrada(50);
    await fijarTotal(e.id!, aCentimos(50.04));
    expect(await debe(t.id!)).toBe(0);
    const dsp = await db.entregas.get(e.id!);
    expect(dsp!.descuentoRedondeo).toBe(aCentimos(0.04));
  });

  it("fijar el total a mano también llega a la deuda", async () => {
    const { t, e } = await jornadaCerrada(50);
    await fijarTotal(e.id!, aCentimos(75));
    expect(money(await debe(t.id!))).toBe("S/ 25.00");
  });

  it("borrar la entrega se lleva su deuda: no se cobra algo que ya no existe", async () => {
    const { t, e } = await jornadaCerrada(0);
    expect(money(await debe(t.id!))).toBe("S/ 50.00");
    await borrarEntrega(e.id!);
    expect(await debe(t.id!)).toBe(0);
  });

  it("con el día abierto no toca deudas: la entrega ya es el saldo del día", async () => {
    await guardarStock(HOY, 100, 0, aCentimos(5));
    const t = await crearTienda("Rosa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: HOY },
    );
    const e = (await db.entregas.where("fecha").equals(HOY).toArray())[0];
    await registrarCobro(t.id!, aCentimos(50), { fecha: HOY });

    await editarEntrega(e.id!, { precioKg: aCentimos(6) });

    // Nada en `deudas`: lo lleva la propia entrega, y Cobranza lo lee de ahí.
    expect(await db.deudas.count()).toBe(0);
    const pend = await cuentasPendientes(HOY);
    expect(pend.find((c) => c.tienda.id === t.id)?.total).toBe(aCentimos(10));
  });
});

describe("deshacer un cobro", () => {
  const debe = async (tiendaId: number) =>
    (await db.deudas.where("tiendaId").equals(tiendaId).toArray())
      .filter((d) => !d.cerrada)
      .reduce((a, d) => a + (d.monto - d.saldado), 0);

  it("un cobro de más se deshace y la plata vuelve a estar por cobrar", async () => {
    await guardarStock(HOY, 100, 0, aCentimos(5));
    const t = await crearTienda("Rosa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: HOY },
    );
    // Tecleó 100 donde iban 10.
    await registrarCobro(t.id!, aCentimos(100), { fecha: HOY });
    const e1 = (await db.entregas.where("fecha").equals(HOY).toArray())[0];
    expect(money(e1.totalCobrado)).toBe("S/ 50.00");

    const [cobro] = await cobrosDe(t.id!, HOY);
    expect(money(cobro.monto)).toBe("S/ 50.00");
    await deshacerCobro(t.id!, cobro.creada);

    const e2 = await db.entregas.get(e1.id!);
    expect(e2!.totalCobrado).toBe(0);
    expect(e2!.estadoPago).toBe("pendiente");
    // Y el pago desaparece: si no, el resumen del día lo contaría igual.
    expect(await db.pagos.count()).toBe(0);
    const pend = await cuentasPendientes(HOY);
    expect(pend.find((c) => c.tienda.id === t.id)?.total).toBe(aCentimos(50));
  });

  it("un cobro que saldó deuda vieja la devuelve a deber", async () => {
    await guardarStock(AYER, 100, 0, aCentimos(5));
    const t = await crearTienda("Chela");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: AYER },
    );
    await cerrarDia(AYER, null, null);
    expect(money(await debe(t.id!))).toBe("S/ 50.00");

    await registrarCobro(t.id!, aCentimos(50), { fecha: HOY });
    expect(await debe(t.id!)).toBe(0);

    const [cobro] = await cobrosDe(t.id!, HOY);
    expect(cobro.aDeuda).toBe(aCentimos(50));
    await deshacerCobro(t.id!, cobro.creada);

    expect(money(await debe(t.id!))).toBe("S/ 50.00");
  });

  /**
   * `registrarCobro` reparte un solo billete entre la deuda vieja y lo de hoy,
   * así que un cobro son varias filas de `pagos`. Deshacer media entrega de
   * plata no significa nada: se deshace el grupo entero.
   */
  it("un cobro repartido entre deuda vieja y lo de hoy se deshace entero", async () => {
    await guardarStock(AYER, 100, 0, aCentimos(5));
    const t = await crearTienda("Olga");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 3, tandas: [aGramos(4)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: AYER },
    ); // 20 de deuda
    await cerrarDia(AYER, null, null);
    await guardarStock(HOY, 100, 0, aCentimos(5));
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: HOY },
    ); // 50 de hoy

    await registrarCobro(t.id!, aCentimos(70), { fecha: HOY });
    const [cobro] = await cobrosDe(t.id!, HOY);
    expect(cobro.pagos.length).toBe(2);
    expect(cobro.aDeuda).toBe(aCentimos(20));

    await deshacerCobro(t.id!, cobro.creada);
    expect(money(await debe(t.id!))).toBe("S/ 20.00");
    const hoy = (await db.entregas.where("fecha").equals(HOY).toArray())[0];
    expect(hoy.totalCobrado).toBe(0);
  });

  /**
   * Una entrega «sin pesar» toma su total del pago. Al deshacerlo, ese total
   * se va con él: dejarlo la pondría a deber un precio que él nunca acordó.
   */
  it("deshacer el pago que le puso precio a una entrega sin pesar le quita el total", async () => {
    await guardarStock(HOY, 100, 0);
    const t = await crearTienda("Julio");
    await registrarEntrega({ tiendaId: t.id!, pollos: 4, sinPesar: true }, ctx(1), { fecha: HOY });
    const e1 = (await db.entregas.where("fecha").equals(HOY).toArray())[0];
    expect(e1.totalCalculado).toBe(0);

    await registrarCobro(t.id!, aCentimos(35), { fecha: HOY });
    const e2 = await db.entregas.get(e1.id!);
    expect(money(e2!.totalCalculado)).toBe("S/ 35.00");

    const [cobro] = await cobrosDe(t.id!, HOY);
    await deshacerCobro(t.id!, cobro.creada);

    const e3 = await db.entregas.get(e1.id!);
    expect(e3!.totalCalculado).toBe(0);
    expect(e3!.totalCobrado).toBe(0);
  });

  it("un total dictado sí se conserva al deshacer: ese no lo puso el pago", async () => {
    await guardarStock(HOY, 100, 0);
    const t = await crearTienda("Marta");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 4, sinPesar: true, totalDictado: aCentimos(42) },
      ctx(1),
      { fecha: HOY },
    );
    const e1 = (await db.entregas.where("fecha").equals(HOY).toArray())[0];
    await registrarCobro(t.id!, aCentimos(42), { fecha: HOY });

    const [cobro] = await cobrosDe(t.id!, HOY);
    await deshacerCobro(t.id!, cobro.creada);

    const e2 = await db.entregas.get(e1.id!);
    expect(money(e2!.totalCalculado)).toBe("S/ 42.00");
    expect(e2!.totalCobrado).toBe(0);
  });

  it("deshacer solo toca el cobro elegido, no los otros del mismo día", async () => {
    await guardarStock(HOY, 100, 0, aCentimos(5));
    const t = await crearTienda("Rosa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: HOY },
    );
    await registrarCobro(t.id!, aCentimos(20), { fecha: HOY });
    await new Promise((r) => setTimeout(r, 2));
    await registrarCobro(t.id!, aCentimos(30), { fecha: HOY });

    const cobros = await cobrosDe(t.id!, HOY);
    expect(cobros.length).toBe(2);
    // El más reciente primero: se deshace el de 30.
    expect(money(cobros[0].monto)).toBe("S/ 30.00");
    await deshacerCobro(t.id!, cobros[0].creada);

    const e = (await db.entregas.where("fecha").equals(HOY).toArray())[0];
    expect(money(e.totalCobrado)).toBe("S/ 20.00");
    expect((await cobrosDe(t.id!, HOY)).length).toBe(1);
  });
});

describe("dos o más entregas sin precio el mismo día a la misma tienda", () => {
  it("un cobro que las cubre a las dos reparte el monto, no se lo queda solo la primera", async () => {
    await guardarStock(HOY, 100, 0);
    const t = await crearTienda("Rosa");
    await registrarEntrega({ tiendaId: t.id!, pollos: 3, sinPesar: true }, ctx(1), { fecha: HOY });
    await registrarEntrega({ tiendaId: t.id!, pollos: 4, sinPesar: true }, ctx(2), { fecha: HOY });

    await registrarCobro(t.id!, aCentimos(90), { fecha: HOY });

    const [e1, e2] = await db.entregas.where("fecha").equals(HOY).sortBy("orden");
    // A prorrata de pollos: 3 y 4 de 7. 90 * 3/7 = 38.571... → se trunca hacia
    // abajo (38.57) y la última se lleva el resto exacto (51.43), nunca al
    // revés: es la última la que absorbe el redondeo, no la primera.
    expect(money(e1.totalCalculado)).toBe("S/ 38.57");
    expect(money(e2.totalCalculado)).toBe("S/ 51.43");
    // Ninguna se queda en 0 — que era el bug: la segunda perdía su dinero.
    expect(e1.totalCalculado).toBeGreaterThan(0);
    expect(e2.totalCalculado).toBeGreaterThan(0);
    // Y no se pierde ni se inventa nada: la suma es exacta.
    expect(e1.totalCalculado + e2.totalCalculado).toBe(aCentimos(90));
    expect(e1.estadoPago).toBe("pagado");
    expect(e2.estadoPago).toBe("pagado");

    // Ya no debería seguir en Cobranza: las dos quedaron pagadas.
    const pend = await cuentasPendientes(HOY);
    expect(pend.find((c) => c.tienda.id === t.id)).toBeUndefined();
  });

  it("con tres entregas y pollos en 0 (piernas sueltas), reparte en partes iguales", async () => {
    await guardarStock(HOY, 0, 30);
    const t = await crearTienda("Marta");
    await registrarEntrega({ tiendaId: t.id!, pollos: 0, piernas: 4, sinPesar: true }, ctx(1), { fecha: HOY });
    await registrarEntrega({ tiendaId: t.id!, pollos: 0, piernas: 4, sinPesar: true }, ctx(2), { fecha: HOY });
    await registrarEntrega({ tiendaId: t.id!, pollos: 0, piernas: 4, sinPesar: true }, ctx(3), { fecha: HOY });

    await registrarCobro(t.id!, aCentimos(30), { fecha: HOY });

    const tres = await db.entregas.where("fecha").equals(HOY).sortBy("orden");
    const suma = tres.reduce((a, e) => a + e.totalCalculado, 0);
    expect(suma).toBe(aCentimos(30));
    // 30 entre 3 = 10 justo, ninguna en cero.
    for (const e of tres) expect(e.totalCalculado).toBe(aCentimos(10));
  });

  it("no le pone precio a una entrega que ya lo tenía, solo a las que faltan", async () => {
    await guardarStock(HOY, 100, 0, aCentimos(5));
    const t = await crearTienda("Julio");
    // Una con precio normal…
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: HOY },
    );
    // …y otra sin pesar, sin total.
    await registrarEntrega({ tiendaId: t.id!, pollos: 2, sinPesar: true }, ctx(2), { fecha: HOY });

    const [con] = await db.entregas.where("fecha").equals(HOY).sortBy("orden");
    const debiaAntes = con.totalCalculado;
    expect(money(debiaAntes)).toBe("S/ 50.00");

    // Más de lo que debe la de precio conocido (50): el sobrante tiene que
    // caer en la que todavía no tiene precio, no perderse.
    await registrarCobro(t.id!, aCentimos(60), { fecha: HOY });

    const [con2, sin2] = await db.entregas.where("fecha").equals(HOY).sortBy("orden");
    // La que ya tenía precio no cambia de total, solo se le abona.
    expect(con2.totalCalculado).toBe(debiaAntes);
    // Toda la plata que sobra tras pagar la de precio conocido va a la que
    // faltaba, no se reparte con la que ya estaba resuelta.
    expect(sin2.totalCalculado).toBeGreaterThan(0);
  });

  /** Deshacer uno de los dos cobros repartidos no debe tocar el otro. */
  it("deshacer el cobro de una de las dos entregas repartidas no afecta a la otra", async () => {
    await guardarStock(HOY, 100, 0);
    const t = await crearTienda("Olga");
    await registrarEntrega({ tiendaId: t.id!, pollos: 3, sinPesar: true }, ctx(1), { fecha: HOY });
    await registrarEntrega({ tiendaId: t.id!, pollos: 5, sinPesar: true }, ctx(2), { fecha: HOY });
    await registrarCobro(t.id!, aCentimos(80), { fecha: HOY });

    const [cobro] = await cobrosDe(t.id!, HOY);
    // Un solo grupo (mismo `creada`), aunque haya escrito dos filas de pago.
    expect(cobro.pagos.length).toBe(2);

    await deshacerCobro(t.id!, cobro.creada);

    const [e1, e2] = await db.entregas.where("fecha").equals(HOY).sortBy("orden");
    // Las dos vuelven a cero: el cobro entero se deshace, no solo una parte.
    expect(e1.totalCalculado).toBe(0);
    expect(e2.totalCalculado).toBe(0);
    expect(e1.totalCobrado).toBe(0);
    expect(e2.totalCobrado).toBe(0);
  });
});

describe("deshacer un cobro de un día que ya se cerró", () => {
  it("el saldo que vuelve a faltar aparece en Cobranza y en la ficha, no desaparece", async () => {
    await guardarStock(HOY, 100, 0, aCentimos(5));
    const t = await crearTienda("Rosa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: HOY },
    );
    const e = (await db.entregas.where("fecha").equals(HOY).toArray())[0];
    await registrarCobro(t.id!, aCentimos(50), { fecha: HOY });
    await cerrarDia(HOY, null, null);
    expect(await db.deudas.count()).toBe(0);

    const [cobro] = await cobrosDe(t.id!, HOY);
    await deshacerCobro(t.id!, cobro.creada);

    const eDsp = await db.entregas.get(e.id!);
    // La entrega sigue valiendo 50: deshacer un cobro no inventa un descuento.
    expect(money(eDsp!.totalCalculado)).toBe("S/ 50.00");
    expect(eDsp!.totalCobrado).toBe(0);

    const pend = await cuentasPendientes(sumarDias(HOY, 1));
    expect(pend.find((c) => c.tienda.id === t.id)?.total).toBe(aCentimos(50));
    expect((await fichaDe(t.id!))!.debe).toBe(aCentimos(50));
  });

  it("deshacer un pago mixto (deuda vieja + entrega de un día ya cerrado) restaura las dos partes", async () => {
    const antier = sumarDias(HOY, -2);
    await guardarStock(antier, 100, 0, aCentimos(5));
    const t = await crearTienda("Elsa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 3, tandas: [aGramos(4)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: antier },
    ); // debe 20
    await cerrarDia(antier, null, null);

    await guardarStock(HOY, 100, 0, aCentimos(5));
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: HOY },
    ); // 50 de hoy
    const eHoy = (await db.entregas.where("fecha").equals(HOY).toArray())[0];

    // Un solo pago de 70 que salda la deuda vieja (20) y la entrega de hoy (50).
    await registrarCobro(t.id!, aCentimos(70), { fecha: HOY });
    await cerrarDia(HOY, null, null);
    expect(await db.deudas.where("cerrada").equals(0).count()).toBe(0);

    const [cobro] = await cobrosDe(t.id!, HOY);
    expect(cobro.aDeuda).toBe(aCentimos(20));
    await deshacerCobro(t.id!, cobro.creada);

    // Las dos vuelven a deberse — la vieja (deuda) y la de hoy (ya cerrada).
    const ficha = (await fichaDe(t.id!))!;
    expect(money(ficha.debe)).toBe("S/ 70.00");

    const eDsp = await db.entregas.get(eHoy.id!);
    expect(eDsp!.totalCalculado).toBe(aCentimos(50));
    expect(eDsp!.totalCobrado).toBe(0);
  });

  it("deshacer un cobro que le puso el total a una entrega sin pesar la deja en cero, corregible con fijarTotal", async () => {
    await guardarStock(HOY, 100, 0);
    const t = await crearTienda("Julio");
    await registrarEntrega({ tiendaId: t.id!, pollos: 4, sinPesar: true }, ctx(1), { fecha: HOY });
    const e = (await db.entregas.where("fecha").equals(HOY).toArray())[0];
    await registrarCobro(t.id!, aCentimos(35), { fecha: HOY });
    await cerrarDia(HOY, null, null);
    // Quedó pagada del todo: no nace deuda.
    expect(await db.deudas.count()).toBe(0);

    const [cobro] = await cobrosDe(t.id!, HOY);
    await deshacerCobro(t.id!, cobro.creada);

    const eDsp = await db.entregas.get(e.id!);
    expect(eDsp!.totalCalculado).toBe(0);
    expect(eDsp!.totalCobrado).toBe(0);
    // No queda una deuda fantasma de S/ 0: nada que cobrar todavía, porque
    // nunca se acordó un precio. Se corrige a mano desde el Historial.
    expect(await db.deudas.count()).toBe(0);

    // Y desde ahí, el camino real de corregirla (fijarTotal) sí funciona:
    await fijarTotal(e.id!, aCentimos(40));
    expect((await fichaDe(t.id!))!.debe).toBe(aCentimos(40));
  });
});

describe("borrar una entrega no toca el historial de OTRO día ya cerrado", () => {
  const DIA1 = "2026-08-10";
  const DIA5 = "2026-08-14";

  it("borra los pagos que sí eran de esta entrega ese mismo día", async () => {
    await guardarStock(DIA1, 100, 0, aCentimos(5));
    const t = await crearTienda("Chela");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: DIA1 },
    );
    const e = (await db.entregas.where("fecha").equals(DIA1).toArray())[0];
    await cobrarEntrega(e.id!, aCentimos(20)); // abono parcial, mismo día

    expect(await db.pagos.where("entregaId").equals(e.id!).count()).toBe(1);
    await borrarEntrega(e.id!);
    // Este sí desaparece: era un pago hecho ese mismo día para esta entrega.
    expect(await db.pagos.where("entregaId").equals(e.id!).count()).toBe(0);
  });

  it("no borra el pago que saldó su deuda en un día posterior, ya cerrado", async () => {
    await guardarStock(DIA1, 100, 0, aCentimos(5));
    const t = await crearTienda("Rosa");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: DIA1 },
    );
    const e = (await db.entregas.where("fecha").equals(DIA1).toArray())[0];
    await cerrarDia(DIA1, null, null); // nace deuda de 50, entregaId = e.id

    await guardarStock(DIA5, 100, 0);
    await registrarCobro(t.id!, aCentimos(50), { fecha: DIA5 });
    const pagosDia5Antes = await db.pagos.where("fecha").equals(DIA5).toArray();
    expect(pagosDia5Antes.length).toBe(1);

    // Borra la entrega original, ya del todo pagada, por lo que sea.
    await borrarEntrega(e.id!);

    // El historial de cobros del día 5 —ya pasado, ya cerrado— no se toca:
    // ese dinero de verdad se cobró ese día y así tiene que seguir contando.
    const pagosDia5Despues = await db.pagos.where("fecha").equals(DIA5).toArray();
    expect(pagosDia5Despues.length).toBe(1);
    expect(pagosDia5Despues[0].id).toBe(pagosDia5Antes[0].id);
  });

  it("cierra la deuda pendiente al borrar la entrega que la originó, sin dejarla cobrable", async () => {
    await guardarStock(DIA1, 100, 0, aCentimos(5));
    const t = await crearTienda("Olga");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 5, tandas: [aGramos(10)], precioKg: aCentimos(5) },
      ctx(1),
      { fecha: DIA1 },
    );
    const e = (await db.entregas.where("fecha").equals(DIA1).toArray())[0];
    await cerrarDia(DIA1, null, null); // nace deuda de 50, sin pagar

    await borrarEntrega(e.id!);

    const abiertas = (await db.deudas.where("tiendaId").equals(t.id!).toArray()).filter(
      (d) => !d.cerrada,
    );
    expect(abiertas.length).toBe(0);
  });
});
