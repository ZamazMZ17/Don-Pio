import { intencionVacia, sanear, type Intencion } from "./intencion";
import { esPalabraNumero, palabrasANumeros } from "./numeros";

/**
 * El intérprete de reglas: sin red, sin API key y sin cuota que se acabe.
 *
 * Es el camino principal, no un respaldo. El plan gratuito de Gemini se agota
 * en una docena de dictados —comprobado en un día real de reparto— así que lo
 * que de verdad tiene que funcionar es esto.
 *
 * Está afinado sobre todo contra el **reconocedor nativo de Android** (el del
 * botón de micrófono), que escupe el texto más sucio: sin puntuación, con
 * muletillas («ya anota…»), números en palabras, precios escritos como horas
 * («9:40») y correcciones a mitad de frase («dos pollos digo tres»). Lo que
 * dicta el teclado de Google llega más limpio y pasa por aquí igual.
 *
 * Todo lo de aquí está ajustado contra dictados reales, no inventados: los
 * casos viven en `reales.test.ts` y salieron del teléfono después de repartir.
 */

/** Un número suelto: 9, 9.50 o 9,50. */
const N = String.raw`\d+(?:[.,]\d+)?`;

/**
 * Las tres presas con sus variantes habladas: pollo/pollito, pierna/piernita,
 * pecho/pechuga/pechito. `poll[oi]` y no `poll` a secas para que «pollería»
 * —que es nombre de cliente, no producto— no cuente como pollo.
 */
const POLLO = String.raw`poll[oi]\w*`;
const PIERNA = String.raw`piern\w*`;
const PECHO = String.raw`pech\w*`;
const PRODUCTO = String.raw`(?:${POLLO}|${PIERNA}|${PECHO})`;

/**
 * Los céntimos que van detrás: «.80», «:40», «con 30», « 50», «y 30».
 * La rama del «y» («nueve y treinta») no puede tragarse la conjunción de
 * verdad, así que se corta si lo que sigue es un producto, un kilo u otro
 * número: «2 pollos y 2 piernas» no son 2.2 de nada.
 */
const CENTS =
  String.raw`(?:\s*[.,:]\s*(\d{1,2})|\s+con\s+(\d{1,2})|\s+(\d{2})\b` +
  String.raw`|\s+y\s+(\d{1,2})\b(?!\s*(?:${PRODUCTO}|kilos?|kg|\d)))?`;

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Sin tildes y en minúsculas, para comparar palabras sin pelear con acentos. */
function llano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
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
    // El `(?![.,]\d)` es lo que impide que «5 kilos 9.50 el kilo» —el precio
    // dicho sin «a»— se coma el «9» como si fueran gramos de la primera
    // pesada: sin él, «5 kilos 9.50» salía 5.900 kg en vez de 5, y el precio
    // se perdía entero.
    String.raw`(${N})\s*(?:kilos?|kg)\b(?:\s+(?:con\s+|y\s+)?(\d{1,3})\b(?![.,]\d))?`,
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
  const re = new RegExp(String.raw`(${N})(?!\s*(?:${PRODUCTO}|kilos?|kg)\b)`, "g");
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
 * como si fuera una hora—, como «a 9 soles con 30» y como «a nueve y treinta».
 *
 * Sin «a» delante se reconoce con «el kilo»/«por kilo» de frente («9.50 el
 * kilo», «9 soles 80 el kilo») o anunciado con la palabra «precio» («al precio
 * de 9.80»): ninguna de esas formas se confunde con un peso.
 */
function precioKilo(t: string): Precio | null {
  const patrones = [
    // «a 9.70», «a 970», «a 9 soles con 30», «a nueve y treinta»
    String.raw`\ba\s+(\d+)(?:\s*soles?)?` + CENTS,
    // «al precio de 9.80», «precio 9.50»
    String.raw`\bprecio\s+(?:de\s+|a\s+)?(\d+)` + CENTS,
    // «9.50 el kilo», «9.50 por kilo»
    String.raw`(\d+)` + CENTS + String.raw`\s*(?:soles?\s+)?(?:el|por)\s+kilos?\b`,
    // «9 soles 80 el kilo» — los céntimos en medio, después de «soles»
    String.raw`(\d+)\s*soles?\s+(\d{1,2})\s+(?:el|por)\s+kilos?\b`,
  ];
  for (const re of patrones) {
    const m = t.match(new RegExp(re));
    if (!m) continue;
    const valor = juntar(m[1], ...m.slice(2));
    // Fuera del rango de un kilo de pollo no es un precio: será otra cosa.
    if (valor >= 3 && valor <= 40) return { valor, texto: m[0] };
  }
  return null;
}

/**
 * El total en soles.
 *
 * Casi nunca dice «total»: dice «53.50 soles» y ya — o «sale 42», «son 42»,
 * «le cobré 42». Lo que lo distingue del precio es que no lleva «a» delante,
 * por eso se busca sobre el texto **con el precio ya recortado**, que es más
 * fiable que mirar hacia atrás. Las formas sin «soles» llevan un candado: si
 * lo que sigue es un producto o un kilo, no era el total («son 3 pollos»).
 */
function total(t: string, precio: Precio | null): number | null {
  const limpio = precio ? t.replace(precio.texto, " ") : t;
  const NOPRODUCTO = String.raw`(?!\s*(?:${PRODUCTO}|kilos?|kg))`;
  const patrones = [
    // El candado de atrás: «peso total 8.200» es el peso, no la cuenta.
    String.raw`(?<!\bpes[oa]\s)\btotal\s+(?:de\s+)?(\d+)` + CENTS,
    String.raw`\bson\s+(\d+)` + CENTS + String.raw`\s*soles?`,
    String.raw`\bqueda(?:n|ron)?\s+en\s+(\d+)` + CENTS,
    String.raw`\bsalen?\s+(?:en\s+)?(\d+)` + CENTS + NOPRODUCTO,
    String.raw`\bserian?\s+(\d+)` + CENTS + NOPRODUCTO,
    String.raw`\b(?:le\s+)?cobre\s+(\d+)` + CENTS + NOPRODUCTO,
    String.raw`\bson\s+(\d+)` + CENTS + NOPRODUCTO,
    // Sin decir «total»: el «soles» al final basta para saber que es la cuenta.
    String.raw`\b(\d+)` + CENTS + String.raw`\s*soles?\b`,
  ];
  for (const re of patrones) {
    const m = limpio.match(new RegExp(re));
    if (m) return juntar(m[1], ...m.slice(2));
  }
  return null;
}

/**
 * Palabras que marcan que el nombre ya terminó y empiezan los datos.
 * Se comparan sin tildes (`llano`), así «pagó» y «bájale» cortan igual.
 */
const CORTE = new RegExp(
  "^(?:" +
    [
      "me",
      "le",
      "les",
      "lo",
      "no",
      "se",
      "que",
      "pag(?:o|a|aron|ado)",
      "dio",
      "dej\\w+",
      "entreg(?:o|ue|aron)",
      "abon(?:o|aron)",
      "cancel(?:o|aron)",
      "deposit(?:o|aron)",
      "yapeo?",
      "plin",
      "transfirio",
      "adelanto",
      "vend(?:i|io)",
      "llev(?:o|a|e|aron)",
      "pes(?:o|a(?:ron|ndo)?)",
      "tiene",
      "qued\\w+",
      "sal(?:e|en|io)",
      "sin",
      "debe",
      "debia",
      "total",
      "son",
      "es",
      "hoy",
      "ayer",
      "dia",
      "manana",
      "todo",
      "nada",
      "cuenta",
      "credito",
      "ojo",
      "balanza",
      "agreg(?:ale|ame|a)",
      "anad(?:ele|e)",
      "sum(?:ale|a)",
      "baj(?:ale|a)",
      "quit(?:ale|a)",
      "aument(?:ale|a)",
      "rebaj(?:ale|a)",
      "descuent(?:ale|a)",
      "corrig(?:ele|e)",
      "cambiale",
      "merma",
    ].join("|") +
    ")$",
);

/**
 * Muletillas de arranque que el reconocedor pega antes del nombre: «ya anota
 * Rosa dos pollos» no es una clienta llamada «Ya anota Rosa».
 */
const MULETILLA =
  /^(?:eh+|em+|este|esto|ya|ok|okey|listo|bueno|oye|haber|a\s+ver|ap[uú]nta(?:me|le)?|an[oó]ta(?:me|le)?|reg[ií]stra(?:me|le)?|pon(?:me|le)?|dale)[\s,]+/i;

/**
 * Recorre palabras acumulando nombre hasta el primer dato (número, verbo de
 * cobro, producto…). Lo comparte el nombre del frente y el del final.
 */
function limpiarNombre(palabras: string[]): string {
  const nombre: string[] = [];

  for (const p of palabras) {
    const limpia = p.replace(/[^\p{L}\p{N}]/gu, "");
    if (!limpia) continue;
    if (esPalabraNumero(limpia) || CORTE.test(llano(limpia))) break;
    nombre.push(p);
    // La coma tras el nombre es la señal más fiable de que ya acabó.
    if (/[,;.]$/.test(p)) break;
  }

  return (
    nombre
      .join(" ")
      // «Cliente» delante es una muletilla suya, no parte del nombre.
      .replace(/^(?:cliente|para|donde|a|al|en)\s+/i, "")
      .replace(/^(?:la|el|los|las)\s+/i, "")
      .replace(/[,;.:]+$/, "")
      .replace(/\s+(?:y|le|les|me)$/i, "")
      .trim()
  );
}

/**
 * El nombre es lo que va antes del primer dato — y si delante no hay nada,
 * se busca al final: «dos pollos para la Rosa».
 *
 * Se busca sobre el texto **original**, no sobre el normalizado, para que se
 * guarde tal como él lo dijo — con sus tildes y sus mayúsculas. Guardar «don
 * julio ramirez» convertiría el directorio en algo que no reconoce escrito.
 */
function cliente(original: string): string {
  let s = original.trim();
  while (MULETILLA.test(s)) s = s.replace(MULETILLA, "");

  const delFrente = limpiarNombre(s.split(/\s+/));
  if (delFrente) return delFrente;

  // El último «para/donde/a» es el que señala al cliente. Si lo que sigue es
  // un número (el «a 9.50» del precio), el recorrido lo descarta solo.
  const alFinal = s.match(/.*\b(?:para|donde|a|al)\s+(.+)$/i);
  return alFinal ? limpiarNombre(alFinal[1].split(/\s+/)) : "";
}

function primerEntero(t: string, re: RegExp): number {
  const m = t.match(re);
  return m ? Math.round(num(m[1]) ?? 0) : 0;
}

/**
 * El peso anunciado con el verbo: «pesó 12», «pesa 2.5», «peso total 8.200».
 * El verbo delata el número aunque no diga «kilos». Los candados: «no se
 * pesó» no es un peso, y un número que ya es el precio o el total tampoco.
 */
function pesoAnclado(t: string, precio: number | null, totalDicho: number | null): number | null {
  const m = t.match(
    new RegExp(String.raw`(?<!\bse\s)(?<!\bno\s)\bpes(?:o|a|aron)\s+(?:total\s+)?(?:de\s+)?(${N})`),
  );
  if (!m) return null;
  const n = num(m[1]);
  if (n === null || n < 0.5 || n > 300) return null;
  if (precio !== null && Math.abs(n - precio) < 0.001) return null;
  if (totalDicho !== null && Math.abs(n - totalDicho) < 0.001) return null;
  return n;
}

/**
 * Rescata el peso cuando no se dijo la palabra «kilo» ni el verbo pesar.
 *
 * Pasa a menudo: «Raquel 5 pollos 13.700», «un pollo 2.550 a 9.80». El número
 * con decimales que sobra, si cae en un peso creíble, es el peso. Se
 * descartan los que ya son otra cosa: cantidades de producto, el precio, el
 * total, y cualquier número seguido de «soles».
 */
function pesoSuelto(t: string, precio: number | null, totalDicho: number | null): number | null {
  const usados = new Set<string>();
  for (const prod of [POLLO, PIERNA, PECHO]) {
    for (const m of t.matchAll(new RegExp(String.raw`(\d+)\s*${prod}`, "g"))) usados.add(m[1]);
  }

  // El separador puede ser punto, coma o un simple espacio: «12 750».
  for (const m of t.matchAll(new RegExp(String.raw`(\d+)[.,\s](\d{2,3})\b(?!\s*soles)`, "g"))) {
    if (usados.has(m[1])) continue;
    const n = Number(`${m[1]}.${m[2]}`);
    if (precio !== null && Math.abs(n - precio) < 0.001) continue;
    if (totalDicho !== null && Math.abs(n - totalDicho) < 0.001) continue;
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
  let t = palabrasANumeros(transcripcion).replace(/\s+/g, " ").trim();
  if (!t) return intencionVacia();

  t = t
    // «s/ 42» del reconocedor → «42 soles», que es como lo buscan los patrones.
    .replace(/\bs\/\.?\s*(\d+(?:[.,]\d+)?)/g, "$1 soles")
    // «dos kilos y medio» sale de palabrasANumeros como «2 kilos y 0.5».
    .replace(/(\d+)\s*(kilos?|kg)\s+y\s+0\.5\b/g, (_, n, u) => `${Number(n) + 0.5} ${u}`)
    // «doce y medio kilos» → «12.5 kilos».
    .replace(/(\d+)\s+y\s+0\.5\b/g, (_, n) => `${n}.5`);

  /*
   * «Dos pollos digo tres»: se corrigió a mitad de dictado y vale lo último.
   * Cada campo se busca primero en la cola (lo dicho después del «digo»); lo
   * que la cola no mencione se toma de la frase entera. Y si la cola trae un
   * producto, las cantidades salen **solo** de ella — «dos pollos digo dos
   * piernas» son piernas, no pollos más piernas.
   */
  const partes = t.split(/\b(?:digo|mejor dicho|corrijo|perdon)\b/);
  const cola = partes.length > 1 ? partes[partes.length - 1].trim() : "";

  const rePollos = new RegExp(String.raw`(${N})\s*${POLLO}`);
  const rePiernas = new RegExp(String.raw`(${N})\s*${PIERNA}`);
  const rePechos = new RegExp(String.raw`(${N})\s*${PECHO}`);
  const colaConProducto = cola !== "" && new RegExp(String.raw`\d\s*${PRODUCTO}`).test(cola);
  const fuenteProductos = colaConProducto ? cola : t;
  const cuenta = (re: RegExp) =>
    colaConProducto
      ? primerEntero(cola, re)
      : (cola ? primerEntero(cola, re) : 0) || primerEntero(t, re);

  const bruto: Partial<Intencion> = {
    // El nombre sale del original; los números, del texto ya convertido.
    cliente: cliente(transcripcion),
    pollos: cuenta(rePollos),
    piernas: cuenta(rePiernas),
    // «pecho», «pechuga» o «pechito»: de las tres formas lo dice. Y si lo
    // nombra sin cantidad («y el pecho para la Rosa») es uno.
    pechos: cuenta(rePechos) || (/\bpech/.test(fuenteProductos) ? 1 : 0),
    sinPesar:
      /\bsin\s+pesar\b|\bno\s+(?:se\s+|lo\s+|le\s+)?pes[oóe]\b|\ba\s+ojo\b|\bal\s+ojo\b|\bsin\s+balanza\b|\bal\s+calculo\b/.test(
        t,
      ),
    notas: /\blo\s+de\s+siempre\b/.test(t) ? "lo de siempre" : "",
  };

  const precio = (cola ? precioKilo(cola) : null) ?? precioKilo(t);
  const totalDicho = (cola ? total(cola, precio) : null) ?? total(t, precio);
  const hayProducto = (bruto.pollos ?? 0) + (bruto.piernas ?? 0) + (bruto.pechos ?? 0) > 0;

  /* ── Cargar stock ── */
  // «llevo» solo cuenta al arranque de la frase: «le llevo 2 pollos a Rosa»
  // es una entrega, no la carga de la mañana.
  if (
    /\b(?:salgo|sali|salir|saliendo|arranco|arranque|empiezo|cargue|cargo|cargando)\b/.test(t) ||
    /^(?:hoy\s+)?llevo\b/.test(t)
  ) {
    return sanear({
      ...bruto,
      intencion: "cargar_stock",
      cliente: "",
      stockPollos: bruto.pollos || null,
      stockPiernas: bruto.piernas || null,
      // Pechos que compró ya sueltos, aparte del pollo entero — no se
      // descuentan del stock de pollos ni suman una pierna (CLAUDE.md §7).
      stockPechos: bruto.pechos || null,
    });
  }

  /* ── Consulta ── */
  if (
    (/\bcuant[oa]s?\b/.test(t) && /\bdebe|deuda|falta\b/.test(t)) ||
    /\bque\s+(?:debe|deuda)\b/.test(t) ||
    /\bcomo\s+va\b/.test(t)
  ) {
    return sanear({ ...bruto, intencion: "consulta" });
  }

  /* ── Ajuste de una entrega ya registrada ── */
  if (
    /\b(?:agregale|agregame|agrega|anadele|anade|sumale|suma|bajale|baja|quitale|quita|aumentale|aumenta|rebajale|rebaja|descuentale|descuenta|corrigele|corrige|cambiale|merma)\b/.test(
      t,
    )
  ) {
    return sanear({ ...bruto, intencion: "ajuste_entrega", tandasKg: pesos(t) });
  }

  /* ── Pagos ── */
  const hayPago =
    /\b(?:pag(?:o|aron|ado)|me\s+dio|me\s+dejo|me\s+entrego|abon\w+|cancel\w+|deposit\w+|yape\w*|plin\w*|transf\w+|adelant\w+|a\s+cuenta)\b/.test(
      t,
    );
  /*
   * «Nancy 2 pollos, ya canceló todo» es una entrega que menciona el pago de
   * pasada: si hay producto **nuevo**, manda la entrega — perder los pollos es
   * mucho peor que perder el cobro, que además se vuelve a ver en Cobranza.
   * Pero «me pagó los 2 pollos de ayer» no deja nada nuevo: el artículo
   * («los», «las») delata que habla de un producto ya entregado, y eso sí es
   * un pago.
   */
  const productoNuevo =
    hayProducto &&
    (() => {
      if (new RegExp(String.raw`\b(?:un|una|el|la)\s+${PECHO}`).test(t)) return true;
      for (const prod of [POLLO, PIERNA, PECHO]) {
        for (const m of t.matchAll(
          new RegExp(String.raw`(\b(?:los|las|sus|mis)\s+)?(${N})\s*${prod}`, "g"),
        )) {
          if (!m[1]) return true;
        }
      }
      return false;
    })();

  if (hayPago && !productoNuevo) {
    const todo = /\b(?:todo|todito|completo|completito|entero|la\s+cuenta|al\s+dia)\b/.test(t);
    const esDeuda =
      /\b(?:deb[ií]a|debe|deuda|saldo|atrasad\w*|pendiente|de\s+ayer|de\s+antes|lo\s+anterior|lo\s+viejo|cuenta\s+vieja|semana\s+pasada)\b/.test(
        t,
      );
    const montosCola = cola ? importes(cola) : [];
    const montos = montosCola.length ? montosCola : importes(t);

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
  const tandasCola = cola ? pesos(cola) : [];
  const tandas = tandasCola.length ? tandasCola : pesos(t);
  const pesoDeTandas = tandas.reduce((a, b) => a + b, 0);
  const anclado = tandas.length
    ? null
    : ((cola ? pesoAnclado(cola, precio?.valor ?? null, totalDicho) : null) ??
      pesoAnclado(t, precio?.valor ?? null, totalDicho));
  const suelto =
    tandas.length || anclado !== null
      ? null
      : ((cola ? pesoSuelto(cola, precio?.valor ?? null, totalDicho) : null) ??
        pesoSuelto(t, precio?.valor ?? null, totalDicho));

  const intencion =
    hayProducto || tandas.length || totalDicho !== null || anclado !== null
      ? "nueva_entrega"
      : "desconocida";

  return sanear({
    ...bruto,
    intencion,
    // Una sola pesada no es una «tanda»: se guarda como peso suelto.
    tandasKg: tandas.length > 1 ? tandas : [],
    pesoTotalKg: tandas.length > 0 ? Number(pesoDeTandas.toFixed(3)) : (anclado ?? suelto),
    precioPorKg: precio?.valor ?? null,
    totalDictado: totalDicho,
  });
}
