/**
 * Números dictados en español a dígitos.
 *
 * El reconocedor de Android devuelve unas veces "14" y otras "catorce", y
 * cambia de criterio en la misma frase. Convertir todo a dígitos antes de
 * buscar patrones deja un solo camino que mantener.
 *
 * Lo importante es **dónde corta**: «nueve cincuenta» son dos números (9 y 50,
 * que en un precio es 9.50), no cincuenta y nueve. En español eso se escribe
 * al revés, así que la regla de composición basta para distinguirlos.
 */

const UNIDADES: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
};

/** 10–29 son piezas indivisibles: no se combinan con nada más pequeño. */
const ATOMICOS: Record<string, number> = {
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

const DECENAS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const CENTENAS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

const MEDIO: Record<string, number> = { medio: 0.5, media: 0.5 };

function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/\p{M}/gu, "");
}

/** ¿Esta palabra es un número dicho? Sirve para saber dónde acaba el nombre. */
export function esPalabraNumero(palabra: string): boolean {
  const p = sinTildes(palabra.toLowerCase()).replace(/[^a-z0-9]/g, "");
  if (!p) return false;
  if (/^\d/.test(p)) return true;
  return clasificar(p).clase !== null;
}

type Clase = "unidad" | "atomico" | "decena" | "centena" | "mil" | "medio" | null;

function clasificar(p: string): { clase: Clase; valor: number } {
  if (p in UNIDADES) return { clase: "unidad", valor: UNIDADES[p] };
  if (p in ATOMICOS) return { clase: "atomico", valor: ATOMICOS[p] };
  if (p in DECENAS) return { clase: "decena", valor: DECENAS[p] };
  if (p in CENTENAS) return { clase: "centena", valor: CENTENAS[p] };
  if (p === "mil") return { clase: "mil", valor: 1000 };
  if (p in MEDIO) return { clase: "medio", valor: MEDIO[p] };
  return { clase: null, valor: 0 };
}

/**
 * ¿Puede `valor` seguir sumándose a lo que ya llevamos?
 *
 * - Centenas solo empiezan («doscientos cincuenta», no «cincuenta doscientos»).
 * - Decenas solo tras centenas o en frío.
 * - Unidades y atómicos tras una decena redonda («treinta y cinco») o tras
 *   centenas. Nunca tras una unidad: ahí es donde «nueve cincuenta» se parte.
 */
function componible(acc: number, clase: Clase): boolean {
  if (acc === 0) return true;
  switch (clase) {
    case "centena":
      // Solo puede seguir a un millar redondo: «mil doscientos» sí,
      // «doscientos trescientos» no.
      return acc % 1000 === 0;
    case "decena":
    case "atomico":
      return acc % 100 === 0;
    case "unidad":
      return acc % 100 === 0 || (acc < 100 && acc % 10 === 0);
    default:
      return false;
  }
}

/**
 * "catorce kilos doscientos" → "14 kilos 200".
 * Deja intacto todo lo que no sea número.
 */
export function palabrasANumeros(texto: string): string {
  const palabras = sinTildes(texto.toLowerCase()).split(/\s+/);
  const salida: string[] = [];

  let acc = 0;
  let abierto = false;
  /** «y» pendiente: se descarta si resultó ser conjunción de verdad. */
  let yPendiente = false;

  const cerrar = () => {
    if (abierto) salida.push(String(acc));
    if (yPendiente) salida.push("y");
    acc = 0;
    abierto = false;
    yPendiente = false;
  };

  for (const cruda of palabras) {
    // La clave de búsqueda va sin puntuación: el reconocedor escribe
    // «cuatrocientos,» y con la coma pegada no encontraba la palabra. Lo que
    // se emite sigue siendo `cruda`, así que el texto no pierde nada.
    const p = cruda.replace(/[^a-z0-9]/g, "");
    if (!p) continue;

    // «treinta y cinco»: la «y» solo une si después viene otro número.
    if (p === "y" && abierto) {
      yPendiente = true;
      continue;
    }

    const { clase, valor } = clasificar(p);

    if (clase === "mil") {
      acc = (abierto ? acc : 1) * 1000;
      abierto = true;
      yPendiente = false;
      continue;
    }

    if (clase === "medio") {
      cerrar();
      salida.push("0.5");
      continue;
    }

    if (clase === null) {
      cerrar();
      salida.push(cruda);
      continue;
    }

    if (componible(acc, clase)) {
      acc += valor;
      abierto = true;
      yPendiente = false;
    } else {
      // No encaja: lo que llevábamos era un número y este empieza otro.
      const previa = acc;
      const teniamos = abierto;
      acc = valor;
      abierto = true;
      yPendiente = false;
      if (teniamos) salida.push(String(previa));
    }
  }

  cerrar();
  return salida.join(" ");
}
