import type { Tienda } from "../db/db";

/**
 * Cuántas visitas recientes mandan en el orden de la ruta.
 *
 * Reparte de lunes a domingo, así que una visita es prácticamente un día: 14
 * son **las dos últimas semanas**. Antes eran 2 —dos días— y con eso el orden
 * daba tumbos: un día que alterara el recorrido (una tienda cerrada, un
 * desvío, pasar a una a deshora) reescribía la lista entera al día siguiente,
 * porque esa excepción era la mitad de la muestra. Con dos semanas hace falta
 * que el cambio se repita para que la ruta lo dé por bueno, y una rareza
 * suelta se diluye.
 *
 * No conviene subirlo mucho más: `MEMORIA` en `emparejar.ts` solo guarda 40
 * observaciones, y el objetivo sigue siendo que **si la ruta cambia de verdad,
 * se note pronto** — un promedio de todo el historial nunca terminaría de
 * enterarse.
 */
export const VISITAS_RUTA = 14;

/**
 * En qué parada suele ir esta tienda, según sus últimas visitas. `null` si
 * todavía no se le conoce ninguna.
 *
 * Vive aquí y no en cada pantalla porque lo usan **los dos** lados —la vista
 * de ruta de Hoy y el orden de Cobranza— y el pedido es que las dos se lean
 * igual. Con la cuenta escrita a mano en cada sitio, cambiar la ventana en uno
 * y no en el otro deja las dos listas en distinto orden.
 */
export function paradaReciente(t: Tienda): number | null {
  const recientes = t.posiciones.slice(-VISITAS_RUTA);
  if (recientes.length === 0) return null;
  return recientes.reduce((a, b) => a + b, 0) / recientes.length;
}

/** Las que aún no tienen parada conocida se van al final de la lista. */
export const SIN_RUTA = 99999;

/**
 * La parada por la que se ordena una tienda en la ruta.
 *
 * `paradaHoy` es su parada real de hoy, si ya se le entregó: ese día manda
 * sobre el promedio, para que la lista siga el recorrido de verdad del día.
 */
export function paradaDe(t: Tienda, paradaHoy?: number): number {
  if (paradaHoy !== undefined) return paradaHoy;
  return paradaReciente(t) ?? (t.ordenRuta > 0 ? t.ordenRuta : SIN_RUTA);
}
