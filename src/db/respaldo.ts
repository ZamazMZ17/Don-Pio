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
  return (
    r.version === 1 &&
    Array.isArray(r.tiendas) &&
    Array.isArray(r.jornadas) &&
    Array.isArray(r.entregas)
  );
}

/**
 * Restaura un respaldo. No borra lo que ya haya en este teléfono: cada fila
 * se guarda por su clave tal cual venía, así que restaurar dos veces el mismo
 * archivo no duplica nada, y restaurar sobre un teléfono con datos propios los
 * mezcla en vez de perderlos.
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
      await db.tiendas.bulkPut(datos.tiendas);
      await db.jornadas.bulkPut(datos.jornadas);
      await db.entregas.bulkPut(datos.entregas);
      await db.pagos.bulkPut(datos.pagos);
      await db.deudas.bulkPut(datos.deudas);
      await db.gastos.bulkPut(datos.gastos);
      await db.ajustes.bulkPut(datos.ajustes);
    },
  );
}
