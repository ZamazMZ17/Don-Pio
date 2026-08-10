import { intencionVacia, sanear, type Intencion } from "./intencion";
import { esPalabraNumero, palabrasANumeros } from "./numeros";

/**
 * El intérprete de reglas: sin red, sin API key y sin cuota que se acabe.
 *
 * Es el camino principal, no un respaldo. El plan gratuito de Gemini se agota
 * en una docena de dictados —comprobado en un día real de reparto— así que lo
 * que de verdad tiene que funcionar es esto, leyendo lo que transcribe el
 * teclado de Google.
 *
 * Todo lo de aquí está ajustado contra dictados reales, no inventados: los
 * casos viven en `reales.test.ts` y salieron del teléfono después de repartir.
 */

/** Un número suelto: 9, 9.50 o 9,50. */
const N = String.raw`\d+(?:[.,]\d+)?`;

/** Los céntimos que van detrás: «.80», «:40», «con 30», « 50». */
const CENTS = String.raw`(?:\s*[.,:]\s*(\d{1,2})|\s+con\s+(\d{1,2})|\s+(\d{2})\b)?`;

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Junta la parte entera con los céntimos, se digan como se digan.
 *
 * Sin céntimos explícitos, un número de tres cifras o más casi nunca es la
 * cantidad real: es el punto que el reconocedor se comió. «A 970» es 9.70, y
 * «35 30 soles» dicho con una pausa —sin «con» ni coma de por medio— sale
 * transcrito pegado como «3530», que es 35.30. En los pedidos reales de
 * reparto no hay entregas de miles de soles, así que hasta 9999 se asume
 * partido; de ahí para arriba ya es sospechoso y se deja tal cual.
 */
function juntar(entero: string, ...dec: (string | undefined)[]): number {
  const d = dec.find(Boolean);
  if (d) return Number(`${entero}.${d}`);
  const n = Number(entero);
  return n >= 100 && n <= 9999 ? n / 100 : n;
}

/**
 * «14 kilos 200» son 14.200 kg, no dos pesos. Es como se lee la balanza y como
 * él lo dicta. El «con» y la «y» son lo que mete al hablar: «siete kilos con
 * doscientos». Sin admitirlos, esa entrega se guardaba 200 gramos corta.
 */
function pesos(t: string): number[] {
  const re = new RegExp(
    String.raw`(${N})\s*(?:kilos?|kg)\b(?:\s+(?:con\s+|y\s+)?(\d{1,3})\b)?`,
    "g",
  );
  const out: number[] = [];
  for (const m of t.matchAll(re)) {
    const enteros = num(m[1]) ?? 0;
    const decimales = m[2] ? Number(m[2]) / Math.pow(10, m[2].length) : 0;
    out.push(Number((enteros + decimales).toFixed(3)));
  }
  return out;
}

/**
 * Los importes que de verdad le entregaron.
 *
 * Aquí hay dos frases muy distintas y solo se distinguen por la conjunción:
 *
 *   «me pagó los 42 de hoy **y** 30 que debía»  → le dieron 72
 *   «pagó 60 **de** una deuda total de 64.30»   → le dieron 60
 *
 * Por eso solo se suman los montos encadenados con «y» o «más». Los que van
 * detrás de «de» son la cuenta, no el pago, y sumarlos daría un disparate.
 */
function importes(t: string): number[] {
  const re = new RegExp(String.raw`(${N})(?!\s*(?:pollos?|piernas?|kilos?|kg)\b)`, "g");
  const hallados = [...t.matchAll(re)];
  const salida: number[] = [];

  for (let i = 0; i < hallados.length; i++) {
    const n = num(hallados[i][1]);
    if (n === null || n <= 0) continue;
    if (salida.length === 0) {
      salida.push(n);
      continue;
    }
    const anterior = hallados[i - 1];
    const entre = t.slice((anterior.index ?? 0) + anterior[0].length, hallados[i].index);
    // «y» suelta, no la de «hoy»: es la que encadena dos pagos.
    if (/\s(?:y|mas|más)\s/.test(entre)) salida.push(n);
    else break;
  }
  return salida;
}

/** El precio y el trozo de texto que lo dijo, para poder recortarlo después. */
interface Precio {
  valor: number;
  texto: string;
}

/**
 * Precio por kilo.
 *
 * Lo que manda es la **«a»**, no la palabra «kilo»: en la calle dice «a 9.80» y
 * se calla. Exigir «el kilo» dejaba sin precio la mitad de las entregas de un
 * día real. También llega como «a 970», como «a 9:40» —el teclado lo escribe
 * como si fuera una hora— y como «a 9 soles con 30».
 */
function precioKilo(t: string): Precio | null {
  const m = t.match(new RegExp(String.raw`\ba\s+(\d+)(?:\s*soles?)?` + CENTS));
  if (!m) return null;
  const valor = juntar(m[1], m[2], m[3], m[4]);
  // Fuera del rango de un kilo de pollo no es un precio: será otra cosa.
  return valor >= 3 && valor <= 40 ? { valor, texto: m[0] } : null;
}

/**
 * El total en soles.
 *
 * Casi nunca dice «total»: dice «53.50 soles» y ya. Lo que lo distingue del
 * precio es que no lleva «a» delante — por eso se busca sobre el texto **con el
 * precio ya recortado**, que es más fiable que mirar hacia atrás.
 */
function total(t: string, precio: Precio | null): number | null {
  const limpio = precio ? t.replace(precio.texto, " ") : t;
  const patrones = [
    String.raw`\btotal\s+(?:de\s+)?(\d+)` + CENTS,
    String.raw`\bson\s+(\d+)` + CENTS + String.raw`\s*soles?`,
    String.raw`\bqueda(?:n|ron)?\s+en\s+(\d+)` + CENTS,
    // Sin decir «total»: el «soles» al final basta para saber que es la cuenta.
    String.raw`\b(\d+)` + CENTS + String.raw`\s*soles?\b`,
  ];
  for (const re of patrones) {
    const m = limpio.match(new RegExp(re));
    if (m) return juntar(m[1], m[2], m[3], m[4]);
  }
  return null;
}

/** Palabras que marcan que el nombre ya terminó y empiezan los datos. */
const CORTE =
  /^(?:me|pag[oóa]|pagaron|pagó|dio|entreg[oó]|abon[oó]|cancel[oó]|sin|debe|deb[ií]a|lo)$/i;

/**
 * El nombre es lo que va antes del primer dato.
 *
 * Se busca sobre el texto **original**, no sobre el normalizado, para que se
 * guarde tal como él lo dijo — con sus tildes y sus mayúsculas. Guardar «don
 * julio ramirez» convertiría el directorio en algo que no reconoce escrito.
 */
function cliente(original: string): string {
  const palabras = original.trim().split(/\s+/);
  const nombre: string[] = [];

  for (const p of palabras) {
    const limpia = p.replace(/[^\p{L}\p{N}]/gu, "");
    if (!limpia) continue;
    if (esPalabraNumero(limpia) || CORTE.test(limpia)) break;
    nombre.push(p);
    // La coma tras el nombre es la señal más fiable de que ya acabó.
    if (/[,;.]$/.test(p)) break;
  }

  return nombre
    .join(" ")
    // «Cliente» delante es una muletilla suya, no parte del nombre.
    .replace(/^(?:cliente|para|donde|a|al|en)\s+/i, "")
    .replace(/^(?:la|el|los|las)\s+/i, "")
    .replace(/[,;.:]+$/, "")
    .replace(/\s+(?:y|le|me)$/i, "")
    .trim();
}

function primerEntero(t: string, re: RegExp): number {
  const m = t.match(re);
  return m ? Math.round(num(m[1]) ?? 0) : 0;
}

/**
 * Rescata el peso cuando no se dijo la palabra «kilo».
 *
 * Pasa a menudo: «Raquel 5 pollos 13.700», «un pollo 2.550 a 9.80». El número
 * con decimales que sobra, si cae en un peso creíble, es el peso.
 */
function rescatarPeso(t: string, precio: number | null): number | null {
  const usados = new Set<string>();
  for (const re of [/(\d+)\s*pollos?/g, /(\d+)\s*piernas?/g, /(\d+)\s*pech/g]) {
    for (const m of t.matchAll(re)) usados.add(m[1]);
  }

  // El separador puede ser punto, coma o un simple espacio: «12 750».
  for (const m of t.matchAll(new RegExp(String.raw`(\d+)[.,\s](\d{2,3})\b`, "g"))) {
    if (usados.has(m[1])) continue;
    const n = Number(`${m[1]}.${m[2]}`);
    if (precio !== null && Math.abs(n - precio) < 0.001) continue;
    if (n >= 0.5 && n <= 300) return n;
  }
  return null;
}

/**
 * Interpreta un dictado. Siempre devuelve algo: si no reconoce la intención,
 * la marca `desconocida` y la tarjeta pide los datos a mano en vez de tragarse
 * el dictado en silencio.
 */
export function interpretarLocal(transcripcion: string): Intencion {
  const t = palabrasANumeros(transcripcion).replace(/\s+/g, " ").trim();
  if (!t) return intencionVacia();

  const bruto: Partial<Intencion> = {
    // El nombre sale del original; los números, del texto ya convertido.
    cliente: cliente(transcripcion),
    pollos: primerEntero(t, new RegExp(String.raw`(${N})\s*pollos?\b`)),
    piernas: primerEntero(t, new RegExp(String.raw`(${N})\s*piernas?\b`)),
    // «pecho», «pechuga» o «pechito»: de las tres formas lo dice. Y si lo
    // nombra sin cantidad («y el pecho para la Rosa») es uno.
    pechos:
      primerEntero(t, new RegExp(String.raw`(${N})\s*pech`)) || (/\bpech/.test(t) ? 1 : 0),
    sinPesar: /\bsin\s+pesar\b/.test(t),
    notas: /\blo\s+de\s+siempre\b/.test(t) ? "lo de siempre" : "",
  };

  const precio = precioKilo(t);
  const totalDicho = total(t, precio);
  const hayProducto = (bruto.pollos ?? 0) + (bruto.piernas ?? 0) + (bruto.pechos ?? 0) > 0;

  /* ── Cargar stock ── */
  if (/\b(?:salgo|sali|salir|cargue|cargo|llevo|llevar)\b/.test(t)) {
    return sanear({
      ...bruto,
      intencion: "cargar_stock",
      cliente: "",
      stockPollos: bruto.pollos || null,
      stockPiernas: bruto.piernas || null,
    });
  }

  /* ── Consulta ── */
  if (/\bcuant[oa]s?\b/.test(t) && /\bdebe|deuda|falta\b/.test(t)) {
    return sanear({ ...bruto, intencion: "consulta" });
  }

  /* ── Ajuste de una entrega ya registrada ── */
  if (/\b(?:agregale|agrega|anadele|sumale|suma|bajale|baja|quitale|quita|merma)\b/.test(t)) {
    return sanear({ ...bruto, intencion: "ajuste_entrega", tandasKg: pesos(t) });
  }

  /* ── Pagos ── */
  const hayPago = /\b(?:pago|pagaron|me\s+dio|me\s+entrego|abono|cancelo|deposito)\b/.test(t);
  /*
   * «Nancy 2 pollos total 57.70 más la deuda de ayer, ya canceló todo» es una
   * entrega, no un cobro: menciona el pago de pasada. Si hay producto y cuenta,
   * manda la entrega — perder los pollos es mucho peor que perder el cobro, que
   * además se vuelve a ver en la cobranza.
   */
  if (hayPago && !(hayProducto && totalDicho !== null)) {
    const todo = /\b(?:todo|completo|entero|la\s+cuenta|al\s+dia)\b/.test(t);
    const esDeuda =
      /\b(?:deb[ií]a|deuda|saldo|de\s+lo\s+de\s+ayer|lo\s+anterior|lo\s+viejo)\b/.test(t);
    const montos = importes(t);

    return sanear({
      ...bruto,
      intencion: esDeuda ? "abono_deuda" : "registrar_pago",
      pollos: 0,
      piernas: 0,
      pechos: 0,
      pagoTodo: todo,
      monto: todo ? null : Number(montos.reduce((a, b) => a + b, 0).toFixed(2)) || null,
    });
  }

  /* ── Entrega ── */
  const tandas = pesos(t);
  const pesoDeTandas = tandas.reduce((a, b) => a + b, 0);
  const intencion =
    hayProducto || tandas.length || totalDicho !== null ? "nueva_entrega" : "desconocida";

  return sanear({
    ...bruto,
    intencion,
    // Una sola pesada no es una «tanda»: se guarda como peso suelto.
    tandasKg: tandas.length > 1 ? tandas : [],
    pesoTotalKg:
      tandas.length > 0
        ? Number(pesoDeTandas.toFixed(3))
        : rescatarPeso(t, precio?.valor ?? null),
    precioPorKg: precio?.valor ?? null,
    totalDictado: totalDicho,
  });
}
