import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  abonarMovimientoPollero,
  borrarMovimientoPollero,
  borrarPollero,
  crearPollero,
  movimientosDePollero,
  registrarMovimientoPollero,
  resumenPollerosDe,
  saldoDePollero,
  saldosPorPollero,
  todosLosPolleros,
} from "./polleros";
import { guardarStock, resumenDe } from "./jornada";
import { registrarEntrega } from "./entregas";
import { aCentimos, aGramos, money } from "../lib/dinero";
import type { Contexto } from "../tiendas/emparejar";
import { crearTienda } from "./tiendas";

const HOY = "2026-08-22";
const AYER = "2026-08-21";

const ctx = (posicion: number, minuto = 420): Contexto => ({ minuto, posicion });

beforeEach(async () => {
  await Promise.all([
    db.tiendas.clear(),
    db.entregas.clear(),
    db.jornadas.clear(),
    db.polleros.clear(),
    db.movimientosPollero.clear(),
    db.pagosPollero.clear(),
  ]);
});

describe("el directorio de polleros", () => {
  it("se da de alta a mano, con su nombre normalizado", async () => {
    // normalizar() quita honoríficos como «don» — mismo comportamiento que
    // el directorio de tiendas (tiendas/normalizar.ts).
    const p = await crearPollero("Don Beto");
    expect(p.nombre).toBe("Don Beto");
    expect(p.nombreNorm).toBe("beto");
    expect(await todosLosPolleros()).toHaveLength(1);
  });

  it("no se puede borrar con saldo pendiente en cualquiera de los dos sentidos", async () => {
    const p = await crearPollero("Don Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: 5, total: aCentimos(200), pagado: 0 },
      HOY,
    );
    expect(await borrarPollero(p.id!)).toEqual({ ok: false });

    await abonarMovimientoPollero(
      (await movimientosDePollero(p.id!))[0].id!,
      aCentimos(200),
      HOY,
    );
    expect(await borrarPollero(p.id!)).toEqual({ ok: true });
  });
});

describe("registrar una compra o venta", () => {
  it("una compra fiada del todo queda con pagado en 0", async () => {
    const p = await crearPollero("Don Beto");
    const id = await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: 10, total: aCentimos(380) },
      HOY,
    );
    const m = await db.movimientosPollero.get(id);
    expect(m?.pagado).toBe(0);
    expect(m?.total).toBe(aCentimos(380));
  });

  it("pagar de más al registrar se recorta al total — no se inventa saldo a favor", async () => {
    const p = await crearPollero("Don Beto");
    const id = await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "venta", pollos: 3, total: aCentimos(100), pagado: aCentimos(150) },
      HOY,
    );
    const m = await db.movimientosPollero.get(id);
    expect(m?.pagado).toBe(aCentimos(100));
  });

  it("cantidades negativas no se cuelan", async () => {
    const p = await crearPollero("Don Beto");
    const id = await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: -5, total: -200 },
      HOY,
    );
    const m = await db.movimientosPollero.get(id);
    expect(m?.pollos).toBe(0);
    expect(m?.total).toBe(0);
  });
});

describe("saldo con un pollero", () => {
  it("una compra sin pagar es lo que yo le debo a él", async () => {
    const p = await crearPollero("Don Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: 10, total: aCentimos(380), pagado: 0 },
      HOY,
    );
    const saldo = await saldoDePollero(p.id!);
    expect(money(saldo.leDebo)).toBe("S/ 380.00");
    expect(saldo.meDebe).toBe(0);
  });

  it("una venta sin cobrar es lo que él me debe a mí", async () => {
    const p = await crearPollero("Don Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "venta", pollos: 4, total: aCentimos(150), pagado: 0 },
      HOY,
    );
    const saldo = await saldoDePollero(p.id!);
    expect(saldo.leDebo).toBe(0);
    expect(money(saldo.meDebe)).toBe("S/ 150.00");
  });

  it("abonar reduce el saldo y no lo deja pasar de cero", async () => {
    const p = await crearPollero("Don Beto");
    const id = await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: 10, total: aCentimos(380), pagado: aCentimos(100) },
      HOY,
    );

    await abonarMovimientoPollero(id, aCentimos(500), AYER);
    const m = await db.movimientosPollero.get(id);
    expect(m?.pagado).toBe(aCentimos(380));
    expect((await saldoDePollero(p.id!)).leDebo).toBe(0);
  });

  it("saldosPorPollero junta a todos de una pasada", async () => {
    const a = await crearPollero("Don Beto");
    const b = await crearPollero("Doña Rosa");
    await registrarMovimientoPollero(
      { polleroId: a.id!, tipo: "compra", total: aCentimos(100) },
      HOY,
    );
    await registrarMovimientoPollero(
      { polleroId: b.id!, tipo: "venta", total: aCentimos(60) },
      HOY,
    );
    const saldos = await saldosPorPollero();
    expect(money(saldos.get(a.id!)!.leDebo)).toBe("S/ 100.00");
    expect(money(saldos.get(b.id!)!.meDebe)).toBe("S/ 60.00");
  });

  it("borrar un movimiento se lleva también sus abonos", async () => {
    const p = await crearPollero("Don Beto");
    const id = await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", total: aCentimos(100) },
      AYER,
    );
    await abonarMovimientoPollero(id, aCentimos(40), HOY);
    expect(await db.pagosPollero.count()).toBe(1);

    await borrarMovimientoPollero(id);
    expect(await db.movimientosPollero.count()).toBe(0);
    expect(await db.pagosPollero.count()).toBe(0);
  });
});

describe("el dinero del día (resumenPollerosDe)", () => {
  it("cuenta lo pagado/cobrado al registrar, del día", async () => {
    const p = await crearPollero("Don Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: 10, total: aCentimos(380), pagado: aCentimos(380) },
      HOY,
    );
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "venta", pollos: 2, total: aCentimos(80), pagado: aCentimos(80) },
      HOY,
    );
    const r = await resumenPollerosDe(HOY);
    expect(money(r.pagadoHoy)).toBe("S/ 380.00");
    expect(money(r.cobradoHoy)).toBe("S/ 80.00");
  });

  it("un abono tardío cuenta en el día en que de verdad se pagó, no en el del movimiento", async () => {
    const p = await crearPollero("Don Beto");
    const id = await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: 10, total: aCentimos(380), pagado: 0 },
      AYER,
    );
    await abonarMovimientoPollero(id, aCentimos(380), HOY);

    const deAyer = await resumenPollerosDe(AYER);
    const deHoy = await resumenPollerosDe(HOY);
    expect(deAyer.pagadoHoy).toBe(0);
    expect(money(deHoy.pagadoHoy)).toBe("S/ 380.00");
  });
});

describe("el stock del día cuenta las compras y ventas a polleros (resumenDe)", () => {
  it("comprar pollos sueltos engorda el stock disponible sin tocar el stock cargado", async () => {
    await guardarStock(HOY, 100, 10);
    const p = await crearPollero("Don Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: 20, total: aCentimos(700) },
      HOY,
    );

    const r = await resumenDe(HOY);
    expect(r.stockPollos).toBe(100); // lo cargado no cambia
    expect(r.restantePollos).toBe(120); // pero lo disponible sí
    expect(r.compraPollos).toBe(20);
  });

  it("vender pollos a un pollero adelgaza el stock igual que una entrega", async () => {
    await guardarStock(HOY, 100, 10);
    const p = await crearPollero("Don Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "venta", pollos: 15, total: aCentimos(500) },
      HOY,
    );

    const r = await resumenDe(HOY);
    expect(r.restantePollos).toBe(85);
    expect(r.ventaPollos).toBe(15);
    // Pero no es una entrega a un cliente: no debe contarse como repartido.
    expect(r.repartidoPollos).toBe(0);
    expect(r.entregas).toBe(0);
  });

  it("vender más piernas de las que hay sueltas rompe pollos propios, igual que repartirlas", async () => {
    await guardarStock(HOY, 100, 2);
    const p = await crearPollero("Don Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "venta", piernas: 5, total: aCentimos(90) },
      HOY,
    );

    const r = await resumenDe(HOY);
    // 2 piernas sueltas, vendió 5: 3 de más solo pudieron salir de partir 3
    // pollos — cada uno deja un pecho sin vender.
    expect(r.restantePollos).toBe(97);
    expect(r.restantePiernas).toBe(0);
    expect(r.pechosLibres).toBe(3);
  });

  it("comprar pechos sueltos no rompe un pollo propio al entregarlos (como stockPechos)", async () => {
    await guardarStock(HOY, 100, 10);
    const p = await crearPollero("Don Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pechos: 3, total: aCentimos(60) },
      HOY,
    );
    const t = await crearTienda("Julieta");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 0, pechos: 3, peso: aGramos(6), precioKg: aCentimos(10) },
      ctx(1),
      { fecha: HOY },
    );

    const r = await resumenDe(HOY);
    expect(r.restantePollos).toBe(100); // ningún pollo propio se partió
    expect(r.restantePiernas).toBe(10); // el montón de piernas no se infló
  });

  it("sin ningún movimiento, el resumen es exactamente el de siempre", async () => {
    await guardarStock(HOY, 120, 18, undefined, 2);
    const r = await resumenDe(HOY);
    expect(r.compraPollos).toBe(0);
    expect(r.ventaPollos).toBe(0);
    expect(r.pagadoPolleros).toBe(0);
    expect(r.cobradoPolleros).toBe(0);
    expect(r.restantePollos).toBe(120);
    expect(r.pechosLibres).toBe(2);
  });

  it("el dinero pagado/cobrado a polleros hoy aparece en el resumen del día", async () => {
    await guardarStock(HOY, 100, 10);
    const p = await crearPollero("Don Beto");
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "compra", pollos: 10, total: aCentimos(380), pagado: aCentimos(380) },
      HOY,
    );
    await registrarMovimientoPollero(
      { polleroId: p.id!, tipo: "venta", pollos: 2, total: aCentimos(80), pagado: aCentimos(80) },
      HOY,
    );
    const r = await resumenDe(HOY);
    expect(money(r.pagadoPolleros)).toBe("S/ 380.00");
    expect(money(r.cobradoPolleros)).toBe("S/ 80.00");
  });
});
