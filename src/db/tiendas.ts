import { db, tiendaNueva, type Tienda } from "./db";
import { normalizar } from "../tiendas/normalizar";
import { aprender, emparejar, type Contexto, type Emparejamiento } from "../tiendas/emparejar";
import { hoyISO, minutoDelDia, type DiaISO } from "../lib/fecha";
import type { Centimos } from "../lib/dinero";

/**
 * El directorio. **Nunca se carga a mano**: cada tienda nace del primer dictado
 * que la nombra y se va afinando sola con cada confirmación.
 */

export async function todasLasTiendas(): Promise<Tienda[]> {
  return db.tiendas.toArray();
}

/**
 * El contexto de ruta del momento: qué parada toca y a quién le entregó justo
 * antes. Es lo que permite distinguir a dos clientes del mismo nombre.
 */
export async function contextoDeRuta(fecha: DiaISO = hoyISO()): Promise<Contexto> {
  const entregas = await db.entregas.where("fecha").equals(fecha).toArray();
  const ordenadas = entregas.sort((a, b) => a.orden - b.orden);
  const ultima = ordenadas[ordenadas.length - 1];
  return {
    minuto: minutoDelDia(),
    posicion: ordenadas.length + 1,
    anteriorId: ultima?.tiendaId,
    yaEntregadas: [...new Set(ordenadas.map((e) => e.tiendaId))],
  };
}

/** Busca a quién se refirió el dictado. No escribe nada. */
export async function identificar(
  nombreDictado: string,
  fecha: DiaISO = hoyISO(),
): Promise<{ resultado: Emparejamiento; contexto: Contexto }> {
  const [tiendas, contexto] = await Promise.all([todasLasTiendas(), contextoDeRuta(fecha)]);
  return { resultado: emparejar(nombreDictado, tiendas, contexto), contexto };
}

/**
 * Crea una tienda desde un dictado. Se llama solo cuando él confirma que es
 * alguien nuevo: crear en silencio es justo lo que llena el directorio de
 * duplicados.
 */
export async function crearTienda(
  nombre: string,
  datos: Partial<Pick<Tienda, "precioKgDefecto" | "precioPolloDefecto" | "pesa" | "notas">> = {},
): Promise<Tienda> {
  const limpio = nombre.trim();

  /*
   * Dos clientes con el mismo nombre son dos clientes distintos, y hay muchos.
   * Al segundo se le pone un número detrás — «Juan 2», «Juan 3» — para que se
   * distingan de un vistazo en la lista y, sobre todo, **al cobrar**: si los dos
   * se llaman igual en la pantalla, se le paga al que no era.
   */
  let visible = limpio;
  let n = 1;
  // Se busca el primer número libre, no «cuántos hay»: contar homónimas daba
  // «Juan 2» dos veces, porque «Juan 2» ya no normaliza igual que «Juan».
  while ((await db.tiendas.where("nombreNorm").equals(normalizar(visible)).count()) > 0) {
    n += 1;
    visible = `${limpio} ${n}`;
  }

  const t: Tienda = { ...tiendaNueva(visible, normalizar(visible)), ...datos };
  const id = await db.tiendas.add(t);
  return { ...t, id };
}

/**
 * Apunta a mano lo que una tienda ya debía de antes.
 *
 * Hace falta para arrancar: el día uno cada cliente ya arrastra saldos de la
 * libreta, y sin poder meterlos la app empieza mintiendo. También sirve para
 * cuadrar un día que se registró mal.
 */
export async function agregarDeuda(
  tiendaId: number,
  monto: Centimos,
  fechaOrigen: DiaISO,
): Promise<void> {
  if (monto <= 0) return;
  await db.deudas.add({
    tiendaId,
    entregaId: null,
    fechaOrigen,
    monto,
    saldado: 0,
    cerrada: 0,
    creada: Date.now(),
  });
}

/** Perdona lo que queda de una deuda: incobrable o ya arreglada por fuera. */
export async function cerrarDeudas(tiendaId: number): Promise<void> {
  const abiertas = (await db.deudas.where("tiendaId").equals(tiendaId).toArray()).filter(
    (d) => !d.cerrada,
  );
  for (const d of abiertas) await db.deudas.update(d.id!, { cerrada: 1 });
}

/**
 * Guarda lo aprendido de una entrega confirmada, junto con el precio si él
 * dictó uno distinto: así la próxima vez le basta decir «lo de siempre».
 */
export async function aprenderDeEntrega(
  tiendaId: number,
  ctx: Contexto,
  opciones: {
    dictado?: string;
    precioKg?: Centimos;
    precioPollo?: Centimos;
    sinPesar?: boolean;
  } = {},
): Promise<void> {
  const t = await db.tiendas.get(tiendaId);
  if (!t) return;

  const actualizada = aprender(t, ctx, opciones.dictado);
  if (opciones.precioKg) actualizada.precioKgDefecto = opciones.precioKg;
  if (opciones.precioPollo) actualizada.precioPolloDefecto = opciones.precioPollo;
  if (opciones.sinPesar !== undefined) actualizada.pesa = opciones.sinPesar ? 0 : 1;

  await db.tiendas.put(actualizada);
}

/** Lo que debe una tienda de días ya cerrados. */
export async function deudaDe(tiendaId: number): Promise<Centimos> {
  const deudas = await db.deudas.where("tiendaId").equals(tiendaId).toArray();
  return deudas
    .filter((d) => !d.cerrada)
    .reduce((a, d) => a + (d.monto - d.saldado), 0);
}

/** El día de la deuda más vieja, para poder decir «debe S/ 30 del jueves». */
export async function deudaDetalle(
  tiendaId: number,
): Promise<{ monto: Centimos; desde: DiaISO | null }> {
  const abiertas = (await db.deudas.where("tiendaId").equals(tiendaId).toArray())
    .filter((d) => !d.cerrada)
    .sort((a, b) => (a.fechaOrigen < b.fechaOrigen ? -1 : 1));
  return {
    monto: abiertas.reduce((a, d) => a + (d.monto - d.saldado), 0),
    desde: abiertas[0]?.fechaOrigen ?? null,
  };
}

/** Las deudas de todas las tiendas de una sola pasada, para las listas. */
export async function deudasPorTienda(): Promise<Map<number, Centimos>> {
  const deudas = await db.deudas.toArray();
  const m = new Map<number, Centimos>();
  for (const d of deudas) {
    if (d.cerrada) continue;
    m.set(d.tiendaId, (m.get(d.tiendaId) ?? 0) + (d.monto - d.saldado));
  }
  return m;
}

export async function actualizarTienda(
  id: number,
  cambios: Partial<Tienda>,
): Promise<void> {
  if (cambios.nombre) cambios.nombreNorm = normalizar(cambios.nombre);
  await db.tiendas.update(id, cambios);
}
