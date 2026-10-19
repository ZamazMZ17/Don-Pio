import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { cerrarDia, guardarStock, resumenDe } from "./jornada";
import { cobrarDeudas, cobrarEntrega, cobrosDe, deshacerCobro, registrarCobro, registrarEntrega } from "./entregas";
import { agregarDeuda, crearTienda, deudaDe } from "./tiendas";
import { crearPollero, registrarMovimientoPollero } from "./polleros";
import type { Contexto } from "../tiendas/emparejar";

const HOY = "2026-08-22";
const AYER = "2026-08-21";
const ctx = (posicion: number, minuto = 420): Contexto => ({ minuto, posicion });

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("la caja del día (resumenDe.caja)", () => {
  it("cuenta lo cobrado de deudas viejas: esa plata también está en el bolsillo", async () => {
    const t = await crearTienda("Rosa");
    await guardarStock(HOY, 50, 0);
    await agregarDeuda(t.id!, 3000, AYER);
    await registrarEntrega({ tiendaId: t.id!, pollos: 2, totalDictado: 5000 }, ctx(1), { fecha: HOY });

    // Paga 6000: 3000 se van a la deuda vieja (primero), 3000 a lo de hoy.
    await registrarCobro(t.id!, 6000, { fecha: HOY });

    const r = await resumenDe(HOY);
    expect(r.cobrado).toBe(3000);
    expect(r.cobradoDeuda).toBe(3000);
    expect(r.caja).toBe(6000);
  });

  it("un día solo de cobrar deudas, sin entregas, también tiene caja", async () => {
    const t = await crearTienda("Elsa");
    await agregarDeuda(t.id!, 4500, AYER);
    await registrarCobro(t.id!, 4500, { fecha: HOY });

    const r = await resumenDe(HOY);
    expect(r.cobrado).toBe(0);
    expect(r.caja).toBe(4500);
  });

  it("resta los gastos y lo pagado a polleros, y suma lo cobrado a polleros", async () => {
    const t = await crearTienda("Olga");
    await guardarStock(HOY, 50, 0);
    await registrarEntrega({ tiendaId: t.id!, pollos: 2, totalDictado: 10000 }, ctx(1), { fecha: HOY });
    await registrarCobro(t.id!, 10000, { fecha: HOY });
    await db.gastos.add({ fecha: HOY, concepto: "Almuerzo", monto: 1500, creada: Date.now() });

    const p = await crearPollero("Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: 5, total: 4000, pagado: 2500 },
      HOY,
    );
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "venta", pollos: 1, total: 900, pagado: 900 },
      HOY,
    );

    const r = await resumenDe(HOY);
    // 10000 cobrado − 1500 gasto − 2500 pagado al pollero + 900 cobrado al pollero
    expect(r.caja).toBe(6900);
  });

  it("un abono de hoy a una deuda vieja no infla la caja del día en que nació la deuda", async () => {
    const t = await crearTienda("Juana");
    await guardarStock(AYER, 50, 0);
    await registrarEntrega({ tiendaId: t.id!, pollos: 2, totalDictado: 5000 }, ctx(1), { fecha: AYER });
    await cerrarDia(AYER, 0, null);
    await registrarCobro(t.id!, 5000, { fecha: HOY });

    expect((await resumenDe(AYER)).caja).toBe(0);
    expect((await resumenDe(HOY)).caja).toBe(5000);
  });
});

describe("cobrar desde el Detalle una entrega de un día ya cerrado", () => {
  it("salda la deuda de la tienda, no la cobra dos veces", async () => {
    const t = await crearTienda("Chela");
    await guardarStock(AYER, 50, 0);
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 2, totalDictado: 5000 },
      ctx(1),
      { fecha: AYER },
    );
    await cerrarDia(AYER, 0, null);
    expect(await deudaDe(t.id!)).toBe(5000);

    // El botón «Cobrar S/ 50.00» del Detalle, abierto desde el Historial.
    await cobrarEntrega(id, 5000);

    expect(await deudaDe(t.id!)).toBe(0);
    // La plata entra en la caja de hoy (cuando se cobró), no en la de ayer.
    const hoy = (await import("../lib/fecha")).hoyISO();
    expect((await resumenDe(AYER)).caja).toBe(0);
    expect((await resumenDe(hoy)).caja).toBe(5000);
  });
});

describe("el «Cobrar aquí» de la deuda vieja en el Detalle", () => {
  it("no perdona en silencio lo de hoy cuando paga solo la deuda", async () => {
    const t = await crearTienda("Marina");
    await agregarDeuda(t.id!, 4805, AYER);
    await guardarStock(HOY, 50, 0);
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 1, totalDictado: 1000 },
      ctx(1),
      { fecha: HOY },
    );

    // Lo que hace el banner del Detalle: cobrar la deuda redondeada a la moneda.
    await cobrarDeudas(t.id!, 4800, HOY);

    const e = await db.entregas.get(id);
    // La entrega de hoy (S/ 10) no se cobró: tiene que seguir debiéndose entera.
    expect(e!.totalCalculado - e!.totalCobrado - e!.descuentoRedondeo).toBe(1000);
    // Y la deuda quedó saldada: los 5 céntimos que ninguna moneda cubre se perdonan.
    expect(await deudaDe(t.id!)).toBe(0);
    expect((await resumenDe(HOY)).caja).toBe(4800);
  });
});

describe("cobrarDeudas", () => {
  it("con varias deudas paga primero la más vieja y no cierra lo que sí se puede cobrar", async () => {
    const t = await crearTienda("Lucha");
    await agregarDeuda(t.id!, 3000, "2026-08-10");
    await agregarDeuda(t.id!, 2000, AYER);
    await cobrarDeudas(t.id!, 3500, HOY);
    expect(await deudaDe(t.id!)).toBe(1500);
  });

  it("«Deshacer» lo revierte: la deuda vuelve y la caja de hoy baja", async () => {
    const t = await crearTienda("Paty");
    await agregarDeuda(t.id!, 2000, AYER);
    await cobrarDeudas(t.id!, 2000, HOY);
    expect(await deudaDe(t.id!)).toBe(0);

    const [cobro] = await cobrosDe(t.id!, HOY);
    await deshacerCobro(t.id!, cobro.creada);
    expect(await deudaDe(t.id!)).toBe(2000);
    expect((await resumenDe(HOY)).caja).toBe(0);
  });
});
