import { db, type MovimientoPollero, type Pollero } from "./db";
import { normalizar } from "../tiendas/normalizar";
import { hoyISO, type DiaISO } from "../lib/fecha";
import type { Centimos, Gramos } from "../lib/dinero";

/**
 * Compras y ventas con otros repartidores — no con clientes. A diferencia del
 * directorio de tiendas (`db/tiendas.ts`), este no se construye solo desde
 * el dictado: son pocos, conocidos de memoria, y se dan de alta a mano.
 */

export async function crearPollero(nombre: string, notas = ""): Promise<Pollero> {
  const limpio = nombre.trim();
  const ahora = Date.now();
  const p: Pollero = {
    nombre: limpio,
    nombreNorm: normalizar(limpio),
    notas,
    creada: ahora,
    ultimaVez: ahora,
  };
  const id = await db.polleros.add(p);
  return { ...p, id };
}

export async function todosLosPolleros(): Promise<Pollero[]> {
  return db.polleros.toArray();
}

export async function actualizarPollero(id: number, cambios: Partial<Pollero>): Promise<void> {
  if (cambios.nombre) cambios.nombreNorm = normalizar(cambios.nombre);
  await db.polleros.update(id, cambios);
}

/** Solo se deja borrar sin nada pendiente — misma regla que `borrarTienda`. */
export async function borrarPollero(id: number): Promise<{ ok: true } | { ok: false }> {
  const saldo = await saldoDePollero(id);
  if (saldo.leDebo > 0 || saldo.meDebe > 0) return { ok: false };
  await db.polleros.delete(id);
  return { ok: true };
}

export interface DatosMovimientoPollero {
  polleroId: number;
  tipo: "compra" | "venta";
  pollos?: number;
  piernas?: number;
  pechos?: number;
  peso?: Gramos;
  precioKg?: Centimos;
  total: Centimos;
  /** Lo que ya se liquidó al registrar — 0 si queda fiado del todo. */
  pagado?: Centimos;
  notas?: string;
}

/**
 * Registra una compra o venta con un pollero.
 *
 * `pagado` nunca puede superar `total`: si se pasó (de dedo gordo, o porque
 * incluía algo más), el exceso no desaparece silencioso — se recorta al
 * total, igual que `registrarCobro` nunca aplica más de lo que falta.
 *
 * El pago inicial, si lo hay, deja también su propio `PagoPollero` fechado
 * igual que el movimiento. Parece redundante con `pagado` — pero no lo es:
 * `pagado` es un acumulado que **sigue cambiando** con cada abono posterior
 * (`abonarMovimientoPollero`), y `resumenPollerosDe()` necesita saber cuánta
 * plata se movió **cada día en concreto**, no el acumulado de hoy. Sin esta
 * fila, un abono de mañana sobre esta misma compra —que sube `pagado`—
 * contaminaría retroactivamente el cuadre de caja de **hoy** la próxima vez
 * que se mirara: el mismo problema que `Pago` evita para `Entrega` (§8),
 * aquí aplicado a dos repartidores en vez de a un repartidor y un cliente.
 */
export async function registrarMovimientoPollero(
  datos: DatosMovimientoPollero,
  fecha: DiaISO = hoyISO(),
): Promise<number> {
  const total = Math.max(0, datos.total);
  const pagado = Math.min(Math.max(0, datos.pagado ?? 0), total);

  const m: MovimientoPollero = {
    fecha,
    polleroId: datos.polleroId,
    tipo: datos.tipo,
    pollos: Math.max(0, datos.pollos ?? 0),
    piernas: Math.max(0, datos.piernas ?? 0),
    pechos: Math.max(0, datos.pechos ?? 0),
    peso: Math.max(0, datos.peso ?? 0),
    precioKg: Math.max(0, datos.precioKg ?? 0),
    total,
    pagado,
    notas: datos.notas ?? "",
    creada: Date.now(),
  };

  const id = await db.movimientosPollero.add(m);
  if (pagado > 0) {
    await db.pagosPollero.add({
      polleroId: datos.polleroId,
      movimientoId: id,
      fecha,
      tipo: datos.tipo,
      monto: pagado,
      creada: Date.now(),
    });
  }
  await db.polleros.update(datos.polleroId, { ultimaVez: Date.now() });
  return id;
}

/**
 * Liquida (del todo o en parte) un movimiento que había quedado fiado.
 * Queda un `PagoPollero` fechado **hoy**, aparte del movimiento, para que el
 * cuadre de caja de hoy cuente esta plata aunque la compra o venta haya sido
 * de otro día — la misma razón por la que `Pago` vive aparte de `Entrega`.
 */
export async function abonarMovimientoPollero(
  movimientoId: number,
  monto: Centimos,
  fecha: DiaISO = hoyISO(),
): Promise<void> {
  if (monto <= 0) return;
  await db.transaction("rw", db.movimientosPollero, db.pagosPollero, async () => {
    const m = await db.movimientosPollero.get(movimientoId);
    if (!m) return;
    const falta = m.total - m.pagado;
    const aplica = Math.min(monto, falta);
    if (aplica <= 0) return;

    await db.movimientosPollero.update(movimientoId, { pagado: m.pagado + aplica });
    await db.pagosPollero.add({
      polleroId: m.polleroId,
      movimientoId,
      fecha,
      tipo: m.tipo,
      monto: aplica,
      creada: Date.now(),
    });
  });
}

export async function borrarMovimientoPollero(id: number): Promise<void> {
  await db.transaction("rw", db.movimientosPollero, db.pagosPollero, async () => {
    await db.pagosPollero.where("movimientoId").equals(id).delete();
    await db.movimientosPollero.delete(id);
  });
}

export async function movimientosDePollero(polleroId: number): Promise<MovimientoPollero[]> {
  return (await db.movimientosPollero.where("polleroId").equals(polleroId).toArray()).sort(
    (a, b) => b.creada - a.creada,
  );
}

export interface SaldoPollero {
  /** De las compras que no le pagué del todo: lo que yo le debo a él. */
  leDebo: Centimos;
  /** De las ventas que no me pagó del todo: lo que él me debe a mí. */
  meDebe: Centimos;
}

export async function saldoDePollero(polleroId: number): Promise<SaldoPollero> {
  const movimientos = await db.movimientosPollero.where("polleroId").equals(polleroId).toArray();
  return {
    leDebo: movimientos
      .filter((m) => m.tipo === "compra")
      .reduce((a, m) => a + Math.max(0, m.total - m.pagado), 0),
    meDebe: movimientos
      .filter((m) => m.tipo === "venta")
      .reduce((a, m) => a + Math.max(0, m.total - m.pagado), 0),
  };
}

/** El saldo de todos los polleros de una sola pasada, para la lista. */
export async function saldosPorPollero(): Promise<Map<number, SaldoPollero>> {
  const movimientos = await db.movimientosPollero.toArray();
  const m = new Map<number, SaldoPollero>();
  for (const mov of movimientos) {
    const actual = m.get(mov.polleroId) ?? { leDebo: 0, meDebe: 0 };
    const falta = Math.max(0, mov.total - mov.pagado);
    if (mov.tipo === "compra") actual.leDebo += falta;
    else actual.meDebe += falta;
    m.set(mov.polleroId, actual);
  }
  return m;
}

/**
 * Lo comprado y vendido a polleros en un día, y cuánta plata se movió **ese
 * día** — ya sea liquidada al registrar o en un abono posterior fechado hoy.
 *
 * `resumenDe()` (db/jornada.ts) usa las cantidades para engordar/adelgazar el
 * stock disponible antes de correr la matemática del despiece, y el dinero
 * para que «Deberías tener en la caja» (Cierre) cuente lo que de verdad
 * entró o salió del bolsillo hoy por este lado.
 *
 * El dinero sale **solo** de `pagosPollero` — nunca de `movimiento.pagado`,
 * que es un acumulado y puede seguir subiendo días después de que el
 * movimiento nació (ver la nota en `registrarMovimientoPollero`). Mirar el
 * acumulado aquí habría hecho que un abono de mañana reescribiera en
 * silencio el cuadre de caja de hoy la próxima vez que se consultara.
 */
export interface ResumenPollerosDia {
  compraPollos: number;
  compraPiernas: number;
  compraPechos: number;
  ventaPollos: number;
  ventaPiernas: number;
  ventaPechos: number;
  /** Salió de la caja hoy, por comprarle a un pollero. */
  pagadoHoy: Centimos;
  /** Entró a la caja hoy, por venderle a un pollero. */
  cobradoHoy: Centimos;
}

export async function resumenPollerosDe(fecha: DiaISO): Promise<ResumenPollerosDia> {
  const [movimientos, pagos] = await Promise.all([
    db.movimientosPollero.where("fecha").equals(fecha).toArray(),
    db.pagosPollero.where("fecha").equals(fecha).toArray(),
  ]);
  const compras = movimientos.filter((m) => m.tipo === "compra");
  const ventas = movimientos.filter((m) => m.tipo === "venta");

  return {
    compraPollos: compras.reduce((a, m) => a + m.pollos, 0),
    compraPiernas: compras.reduce((a, m) => a + m.piernas, 0),
    compraPechos: compras.reduce((a, m) => a + m.pechos, 0),
    ventaPollos: ventas.reduce((a, m) => a + m.pollos, 0),
    ventaPiernas: ventas.reduce((a, m) => a + m.piernas, 0),
    ventaPechos: ventas.reduce((a, m) => a + m.pechos, 0),
    pagadoHoy: pagos.filter((p) => p.tipo === "compra").reduce((a, p) => a + p.monto, 0),
    cobradoHoy: pagos.filter((p) => p.tipo === "venta").reduce((a, p) => a + p.monto, 0),
  };
}
