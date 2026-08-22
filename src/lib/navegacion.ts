/**
 * A dónde lleva el atrás desde cada pantalla.
 *
 * Vive aparte de `App.tsx` para poder probarlo: este fallo ya volvió una vez.
 * La primera versión llevaba una **pila** de por dónde había pasado, y el
 * «volver» de cada pantalla la alimentaba sin querer — `ir()` guardaba el
 * origen cuando no era pestaña, así que *retroceder apilaba*. Salir del
 * Detalle dejaba un "detalle" quemado en la pila, con la entrega vieja
 * todavía seleccionada; bastaba un día de reparto y luego Más → Historial →
 * un día → atrás para que lo sacara de ahí y abriera a editar una entrega
 * cualquiera. Con "dia" pasaba lo mismo y Historial-Día se quedaba dando
 * vueltas entre las dos.
 *
 * Aquí no hay estado que ensuciar: el destino del atrás es una propiedad fija
 * de cada pantalla. El botón atrás de Android y el «volver» de la pantalla
 * leen los dos de la misma tabla, así que no pueden discrepar.
 */

export type Pantalla =
  | "hoy"
  | "cobranza"
  | "detalle"
  | "cierre"
  | "tiendas"
  | "historial"
  | "dia"
  | "ajustes"
  | "stock"
  | "gastos"
  | "menu";

/** Las pestañas: la raíz de la navegación, de ellas no se sale hacia atrás. */
export const RAIZ = ["hoy", "cobranza", "tiendas", "menu"] as const;

export type Raiz = (typeof RAIZ)[number];
/** Todo lo que no es pestaña, y por tanto tiene una pantalla de arriba. */
export type Rama = Exclude<Pantalla, Raiz>;

export const esRaiz = (p: Pantalla): p is Raiz => (RAIZ as readonly Pantalla[]).includes(p);

/**
 * La pantalla de arriba de cada rama. Al agregar una pantalla nueva,
 * TypeScript obliga a decir a dónde sale — que es justo lo que se olvidó
 * la vez pasada.
 */
export const PADRE: Record<Rama, Pantalla> = {
  detalle: "hoy",
  cierre: "hoy",
  historial: "hoy",
  stock: "hoy",
  ajustes: "hoy",
  dia: "historial",
  // Se abre solo desde Menú, y su «volver» ya llevaba ahí: el atrás de
  // Android tiene que coincidir, o la misma pantalla sale a un sitio
  // distinto según cuál de los dos botones se toque.
  gastos: "menu",
};

/**
 * De qué lista se abrió el Detalle.
 *
 * Es el **único** destino que no es fijo, porque al Detalle se llega desde tres
 * sitios —la lista de Hoy, una tarjeta de Cobranza y una entrega de un día
 * cerrado en el Historial— y tiene que volver al que lo abrió: salir a Hoy
 * después de corregir una entrega desde Cobranza, en plena vuelta cobrando, es
 * perder el sitio.
 *
 * Ojo con la diferencia respecto de la pila que se quitó: esto es **un solo
 * dato, puesto al abrir**, no un registro de por dónde se pasó. No lo alimenta
 * el retroceder y no crece. `"dia"` no es pestaña, así que sí encadena un paso
 * más (detalle → dia → historial → hoy), pero sigue siendo un camino que
 * termina: `navegacion.test.ts` lo comprueba con cada origen.
 */
export type OrigenDetalle = Extract<Pantalla, "hoy" | "cobranza" | "dia">;

/**
 * A dónde va el atrás desde `p`. Desde una pestaña que no es Hoy, a Hoy;
 * desde Hoy, `null` — no queda nada que cerrar y la app pasa a segundo plano.
 *
 * `origenDetalle` solo se mira estando en el Detalle; sin él vuelve a Hoy,
 * que es lo que dice `PADRE`.
 */
export function atrasDesde(p: Pantalla, origenDetalle?: OrigenDetalle): Pantalla | null {
  if (!esRaiz(p)) return p === "detalle" && origenDetalle ? origenDetalle : PADRE[p];
  return p === "hoy" ? null : "hoy";
}
