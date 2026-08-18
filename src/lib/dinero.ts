/**
 * El dinero se guarda en **céntimos enteros**, nunca en flotantes.
 *
 * No es purismo: la app existe para cuadrar una caja física contra lo que dice
 * la pantalla. Con flotantes, sumar 41 entregas de 248.90 deja un resto de
 * medio céntimo que el repartidor no puede encontrar en su bolsillo, y pierde
 * la confianza en la app el primer día.
 *
 * La convención: los números que salen de la voz o del teclado son soles con
 * decimales; se convierten a céntimos en el borde y adentro todo es entero.
 */

/** Céntimos. Un alias nominal para que no se cuele un número de soles. */
export type Centimos = number;

/** 248.9 → 24890. Redondea al céntimo, que es la unidad mínima real. */
export function aCentimos(soles: number): Centimos {
  return Math.round(soles * 100);
}

/** 24890 → 248.9. Solo para mostrar o para volver a la voz. */
export function aSoles(centimos: Centimos): number {
  return centimos / 100;
}

/** 24890 → "S/ 248.90". Con separador de millares, como en el diseño. */
export function money(centimos: Centimos): string {
  const signo = centimos < 0 ? "-" : "";
  const abs = Math.abs(centimos);
  const entero = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  return `${signo}S/ ${entero.toLocaleString("es-PE")}.${dec}`;
}

/** "248.90" sin el prefijo, para cuando la etiqueta ya dice que son soles. */
export function monto(centimos: Centimos): string {
  const abs = Math.abs(centimos);
  return `${centimos < 0 ? "-" : ""}${Math.floor(abs / 100).toLocaleString("es-PE")}.${String(
    abs % 100,
  ).padStart(2, "0")}`;
}

/**
 * Peso en gramos, por la misma razón que el dinero. Una tanda de 14.2 kg son
 * 14200 g y la suma de tandas tiene que dar exactamente el peso total, porque
 * de ahí sale el precio que el cliente va a pagar.
 */
export type Gramos = number;

export function aGramos(kg: number): Gramos {
  return Math.round(kg * 1000);
}

export function aKilos(gramos: Gramos): number {
  return gramos / 1000;
}

/** 26200 → "26.20 kg". Dos decimales: es como se lee la balanza. */
export function kg(gramos: Gramos, sufijo = true): string {
  const s = (gramos / 1000).toFixed(2);
  return sufijo ? `${s} kg` : s;
}

/** 26200 → "26.20 kg" — para el subtítulo de la lista, sin redondear. */
export function kgCorto(gramos: Gramos): string {
  return `${(gramos / 1000).toFixed(2)} kg`;
}

/**
 * Precio por kilo, también en céntimos (9.50 → 950). Como el peso va en gramos,
 * el total es `precio * gramos / 1000`, y ese resultado se redondea al céntimo
 * una sola vez, al final.
 */
export function totalDePeso(precioPorKilo: Centimos, gramos: Gramos): Centimos {
  return Math.round((precioPorKilo * gramos) / 1000);
}

/**
 * La moneda más pequeña que circula en Perú es la de 10 céntimos: los de 1 y 5
 * ya no se usan. Así que una cuenta de S/ 118.58 no se puede pagar — hay que
 * decirle **118.50**, que sí se puede contar con monedas.
 *
 * Se redondea siempre **hacia abajo**, a favor del cliente. Lo que se deja de
 * cobrar no se pierde: queda registrado como descuento.
 */
export const MONEDA_MINIMA = 10;

export function aCobrar(centimos: Centimos): Centimos {
  return Math.floor(centimos / MONEDA_MINIMA) * MONEDA_MINIMA;
}
