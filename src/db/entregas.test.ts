import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  cuentasPendientes,
  editarEntrega,
  fijarPeso,
  fijarTotal,
  registrarCobro,
  registrarEntrega,
} from "./entregas";
import { cerrarDia, cerrarDiasPasados, resumenDe } from "./jornada";
import { agregarDeuda, crearTienda } from "./tiendas";
import { aCentimos, aGramos, money } from "../lib/dinero";
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
  async function conStock(pollos: number, piernas: number) {
    await db.jornadas.put({
      fecha: HOY,
      stockPollos: pollos,
      stockPiernas: piernas,
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
