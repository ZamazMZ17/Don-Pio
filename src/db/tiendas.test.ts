import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { agregarDeuda, borrarTienda, crearTienda } from "./tiendas";
import { registrarEntrega } from "./entregas";
import { aCentimos, aGramos } from "../lib/dinero";
import { hoyISO, sumarDias } from "../lib/fecha";
import type { Contexto } from "../tiendas/emparejar";

const ctx: Contexto = { minuto: 420, posicion: 1 };

beforeEach(async () => {
  await Promise.all([
    db.tiendas.clear(),
    db.entregas.clear(),
    db.deudas.clear(),
    db.pagos.clear(),
    db.jornadas.clear(),
  ]);
});

describe("borrarTienda", () => {
  it("borra una tienda sin nada pendiente", async () => {
    const t = await crearTienda("Tienda al día");
    const r = await borrarTienda(t.id!);
    expect(r.ok).toBe(true);
    expect(await db.tiendas.get(t.id!)).toBeUndefined();
  });

  it("no borra con deuda de días anteriores", async () => {
    const t = await crearTienda("Debe de antes");
    await agregarDeuda(t.id!, aCentimos(30), sumarDias(hoyISO(), -1));

    const r = await borrarTienda(t.id!);

    expect(r.ok).toBe(false);
    expect(await db.tiendas.get(t.id!)).toBeDefined();
  });

  it("no borra una tienda con una entrega de hoy todavía sin cobrar", async () => {
    // El día de hoy sigue abierto: lo que no se ha cobrado vive en la propia
    // entrega, no en `deudas` todavía (eso solo pasa al cerrar el día). Si
    // `borrarTienda` solo mirara `deudas`, dejaba borrar la tienda con plata
    // de hoy en el aire, y esa entrega desaparecía sin dejar rastro de a quién
    // cobrarle — cuentasPendientes() salta silenciosamente las entregas cuya
    // tienda ya no existe.
    const t = await crearTienda("Recién repartida hoy");
    await registrarEntrega(
      { tiendaId: t.id!, pollos: 2, tandas: [aGramos(5)], precioKg: aCentimos(9) },
      ctx,
      { fecha: hoyISO() },
    );

    const r = await borrarTienda(t.id!);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.deuda).toBeGreaterThan(0);
    expect(await db.tiendas.get(t.id!)).toBeDefined();
  });

  it("sí borra una tienda cuya entrega de hoy ya está cobrada del todo", async () => {
    const t = await crearTienda("Ya pagó hoy");
    const id = await registrarEntrega(
      { tiendaId: t.id!, pollos: 2, tandas: [aGramos(5)], precioKg: aCentimos(9) },
      ctx,
      { fecha: hoyISO() },
    );
    const e = await db.entregas.get(id);
    await db.entregas.update(id, { totalCobrado: e!.totalCalculado, estadoPago: "pagado" });

    const r = await borrarTienda(t.id!);

    expect(r.ok).toBe(true);
    expect(await db.tiendas.get(t.id!)).toBeUndefined();
  });
});
