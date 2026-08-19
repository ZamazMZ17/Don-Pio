import type { Table } from "dexie";
import {
  db,
  type Ajuste,
  type Deuda,
  type Entrega,
  type Gasto,
  type Jornada,
  type Pago,
  type Tienda,
} from "./db";
import { crearTienda } from "./tiendas";
import { CLAVE_API } from "../voz/ajustes";

/**
 * Todo lo que hace falta para levantar la app en otro teléfono: el
 * directorio, lo repartido, las deudas y los ajustes.
 *
 * **Nunca la API key.** Es de este teléfono y de este usuario — CLAUDE.md §3
 * dice que no sale de aquí salvo hacia el proveedor, y un archivo de respaldo
 * viaja por WhatsApp o correo, que no es "hacia el proveedor".
 *
 * Tampoco los dictados pendientes: son la cola de trabajo de este teléfono,
 * no datos que tenga sentido llevarse, y algunos traen el audio grabado
 * adentro, que pesa mucho para lo que aporta.
 */
export interface Respaldo {
  version: 1;
  creado: string;
  tiendas: Tienda[];
  jornadas: Jornada[];
  entregas: Entrega[];
  pagos: Pago[];
  deudas: Deuda[];
  gastos: Gasto[];
  ajustes: Ajuste[];
}

export async function generarRespaldo(): Promise<Respaldo> {
  const [tiendas, jornadas, entregas, pagos, deudas, gastos, ajustes] = await Promise.all([
    db.tiendas.toArray(),
    db.jornadas.toArray(),
    db.entregas.toArray(),
    db.pagos.toArray(),
    db.deudas.toArray(),
    db.gastos.toArray(),
    db.ajustes.toArray(),
  ]);

  return {
    version: 1,
    creado: new Date().toISOString(),
    tiendas,
    jornadas,
    entregas,
    pagos,
    deudas,
    gastos,
    ajustes: ajustes.filter((a) => a.clave !== CLAVE_API),
  };
}

function esRespaldo(x: unknown): x is Respaldo {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  // Las siete listas, no solo las tres primeras: un archivo a medio truncar
  // (o tocado a mano) con `tiendas`/`jornadas`/`entregas` bien pero sin, por
  // ejemplo, `pagos`, pasaba este filtro y reventaba a mitad de la
  // transacción con un `TypeError` críptico en vez de este mensaje claro.
  return (
    r.version === 1 &&
    Array.isArray(r.tiendas) &&
    Array.isArray(r.jornadas) &&
    Array.isArray(r.entregas) &&
    Array.isArray(r.pagos) &&
    Array.isArray(r.deudas) &&
    Array.isArray(r.gastos) &&
    Array.isArray(r.ajustes)
  );
}

/**
 * Guarda una fila del respaldo en su id original si ese id está libre en este
 * teléfono, o si ya es de verdad la misma fila (misma `creada`, que no cambia
 * nunca). Si el id ya es de otra fila con una `creada` distinta, la guarda
 * como una fila nueva y devuelve el id que le tocó — así una tienda o entrega
 * ajena nunca pisa una tuya solo porque el contador autoincremental de los dos
 * teléfonos haya llegado por casualidad al mismo número.
 */
async function ponerOAgregar<T extends { id?: number; creada: number }>(
  tabla: Table<T, number>,
  fila: T,
): Promise<number> {
  const viejo = fila.id;
  const local = viejo !== undefined ? await tabla.get(viejo) : undefined;
  if (local === undefined || local.creada === fila.creada) {
    return tabla.put(fila);
  }
  const { id: _id, ...resto } = fila;
  return tabla.add(resto as T);
}

/**
 * Restaura un respaldo. No borra lo que ya haya en este teléfono, y cada fila
 * se guarda por su clave — restaurar dos veces el mismo archivo no duplica
 * nada, y restaurar sobre un teléfono con datos propios los mezcla en vez de
 * perderlos, sin que una tienda o entrega ajena pise una tuya por una
 * coincidencia de id (ver `ponerOAgregar`).
 */
export async function restaurarRespaldo(bruto: unknown): Promise<void> {
  if (!esRespaldo(bruto)) {
    throw new Error("Ese archivo no es un respaldo de Don Pio.");
  }
  const datos = bruto;

  await db.transaction(
    "rw",
    [db.tiendas, db.jornadas, db.entregas, db.pagos, db.deudas, db.gastos, db.ajustes],
    async () => {
      const idsTienda = new Map<number, number>();
      for (const t of datos.tiendas) {
        const nuevo = await ponerOAgregar(db.tiendas, t);
        if (t.id !== undefined) idsTienda.set(t.id, nuevo);
      }

      /*
       * Una entrega o deuda puede apuntar a una tienda que el respaldo no
       * trae: se borró en el celular de origen después de saldar su cuenta
       * (`borrarTienda` no toca su historial, solo la fila de la tienda). Sin
       * remapear ese id también, quedaba en el número crudo del celular de
       * origen — que en este celular puede ser, por casualidad, el id de una
       * tienda real sin ninguna relación, y le pegaría un historial ajeno a
       * un cliente que nada tiene que ver. Se le arma una tienda de
       * reemplazo, una sola por id huérfano, en vez de confiar en ese número.
       */
      const idsHuerfanos = new Set<number>();
      for (const e of datos.entregas) if (!idsTienda.has(e.tiendaId)) idsHuerfanos.add(e.tiendaId);
      for (const p of datos.pagos) if (!idsTienda.has(p.tiendaId)) idsHuerfanos.add(p.tiendaId);
      for (const d of datos.deudas) if (!idsTienda.has(d.tiendaId)) idsHuerfanos.add(d.tiendaId);
      for (const idViejo of idsHuerfanos) {
        const reemplazo = await crearTienda("Tienda borrada");
        idsTienda.set(idViejo, reemplazo.id!);
      }

      const idsEntrega = new Map<number, number>();
      for (const e of datos.entregas) {
        const nuevo = await ponerOAgregar(db.entregas, {
          ...e,
          tiendaId: idsTienda.get(e.tiendaId) ?? e.tiendaId,
        });
        if (e.id !== undefined) idsEntrega.set(e.id, nuevo);
      }

      for (const p of datos.pagos) {
        await ponerOAgregar(db.pagos, {
          ...p,
          tiendaId: idsTienda.get(p.tiendaId) ?? p.tiendaId,
          entregaId: p.entregaId !== null ? (idsEntrega.get(p.entregaId) ?? p.entregaId) : null,
        });
      }

      for (const d of datos.deudas) {
        await ponerOAgregar(db.deudas, {
          ...d,
          tiendaId: idsTienda.get(d.tiendaId) ?? d.tiendaId,
          entregaId: d.entregaId !== null ? (idsEntrega.get(d.entregaId) ?? d.entregaId) : null,
        });
      }

      for (const g of datos.gastos) {
        await ponerOAgregar(db.gastos, g);
      }

      // Una jornada es una fila por fecha, no por id: no hay dos versiones
      // que mezclar para el mismo día, así que pisar con la del respaldo es
      // lo correcto.
      await db.jornadas.bulkPut(datos.jornadas);
      await db.ajustes.bulkPut(datos.ajustes);
    },
  );
}
