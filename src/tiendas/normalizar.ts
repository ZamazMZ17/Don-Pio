/**
 * Limpieza de nombres dictados.
 *
 * Todo lo que entra aquí viene de un reconocedor de voz, así que llega con
 * honoríficos («para la señora Rosa»), con el tipo de local pegado («bodega
 * Milagros») y con la ortografía que le dio la gana («Rossa Kispe»). El
 * emparejamiento compara siempre sobre la forma normalizada.
 */

/**
 * Palabras que no identifican a nadie: si dos clientes se llaman «Rosa», que
 * uno sea «señora» y el otro «doña» no los distingue.
 *
 * «bodega», «mercado» y «pollería» también se van, porque él dicta unas veces
 * «bodega Milagros» y otras solo «Milagros». Se quitan solo para comparar: el
 * nombre que se muestra conserva todo.
 */
const RUIDO = new Set([
  "don",
  "dona",
  "senor",
  "senora",
  "senorita",
  "sr",
  "sra",
  "srta",
  "la",
  "el",
  "los",
  "las",
  "de",
  "del",
  "para",
  "a",
  "al",
  "bodega",
  "mercado",
  "polleria",
  "tienda",
  "chifa",
  "restaurante",
  "puesto",
]);

/**
 * Quita tildes y la eñe. `\p{M}` son las marcas combinantes, que es justo lo
 * que deja NFD al separar la tilde de su vocal.
 */
export function sinAcentos(t: string): string {
  return t.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * "Para la señora Rosa Quispe" → "rosa quispe".
 * Devuelve "" si no quedó nada útil: eso es señal de que el dictado no nombró
 * a nadie y hay que preguntar.
 */
export function normalizar(nombre: string): string {
  return tokens(nombre).join(" ");
}

export function tokens(nombre: string): string[] {
  return sinAcentos(nombre.toLowerCase())
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 0 && !RUIDO.has(t));
}

/**
 * Distancia de edición acotada. Se corta en `tope` porque comparar contra 50+
 * tiendas en cada dictado tiene que ser instantáneo, y una distancia de 6 ya
 * es un nombre distinto: no hace falta saber si es 6 u 11.
 */
export function distancia(a: string, b: string, tope = 6): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > tope) return tope + 1;

  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let mejorEnFila = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + coste);
      fila.push(v);
      if (v < mejorEnFila) mejorEnFila = v;
    }
    // Si la fila entera ya pasó el tope, ninguna fila posterior puede bajar.
    if (mejorEnFila > tope) return tope + 1;
    previa = fila;
  }
  return previa[b.length];
}

/** 0..1. 1 = idénticas. */
function parecidoPalabra(a: string, b: string): number {
  if (a === b) return 1;
  const largo = Math.max(a.length, b.length);
  if (largo === 0) return 0;
  // Un prefijo compartido largo salva los cortes del reconocedor
  // («Milagros» → «Milagro»).
  if (largo >= 5 && (a.startsWith(b) || b.startsWith(a))) return 0.92;
  const d = distancia(a, b);
  return Math.max(0, 1 - d / largo);
}

/**
 * Parecido entre dos nombres normalizados, 0..1.
 *
 * Por tokens y no por la cadena entera: él dicta «Julio» un día y «don Julio
 * Ramírez» otro, y son la misma persona. Cada palabra del dictado busca su
 * mejor pareja en la candidata y se promedia, pero el peor encaje pesa aparte
 * para que «Rosa Flores» no se cuele como «Rosa Quispe» solo por el nombre.
 */
export function parecido(dictado: string, candidata: string): number {
  const a = dictado.split(" ").filter(Boolean);
  const b = candidata.split(" ").filter(Boolean);
  if (a.length === 0 || b.length === 0) return 0;

  const puntajes = a.map((pa) => Math.max(...b.map((pb) => parecidoPalabra(pa, pb))));
  const media = puntajes.reduce((x, y) => x + y, 0) / puntajes.length;
  const minimo = Math.min(...puntajes);

  return media * 0.75 + minimo * 0.25;
}
