import type { Tienda } from "../db/db";
import { horaTxt } from "../lib/fecha";
import { normalizar, parecido } from "./normalizar";

/**
 * Identificar a qué tienda se refirió un dictado.
 *
 * Pedido literal del dueño: «hay muchos clientes que tienen el mismo nombre,
 * entonces para evitar eso de preferencia que correlacione nombre y hora,
 * porque los que se entregan más cerca al punto de partida es en la mañanita y
 * hay algunos que ya se entrega un poquito más tarde, o después de ciertos
 * clientes».
 *
 * Así que el nombre solo no basta. Se puntúa con tres señales, y ninguna de
 * las dos de contexto puede rescatar un nombre que no encaja: la hora
 * desempata entre parecidos, nunca inventa un parecido.
 */

export const PESO_NOMBRE = 0.5;
export const PESO_HORA = 0.3;
export const PESO_SECUENCIA = 0.2;

/**
 * Por debajo de esto el nombre no da ni para considerar a la candidata. Es la
 * reja que impide que la hora «adivine» a alguien que él no nombró.
 */
export const UMBRAL_NOMBRE = 0.62;

/**
 * Nombre lo bastante bueno como para no necesitar que el contexto lo respalde.
 * Por debajo, si además la hora y la ruta no dicen nada, se pregunta.
 */
export const NOMBRE_SEGURO = 0.8;

/** Hora o secuencia por debajo de esto no aportan nada a favor. */
export const CONTEXTO_FLOJO = 0.3;

/**
 * Si la primera y la segunda están más cerca que esto, no se elige: se
 * pregunta. Equivocarse de tienda le cobra a quien no era.
 */
export const MARGEN_AMBIGUO = 0.08;

/**
 * Cuánto se dispersan las horas de una misma tienda. 45 min es holgado a
 * propósito: la ruta se atrasa por el tráfico y por lo que se demore cobrando,
 * y no queremos que un mal día invente una tienda nueva.
 */
export const SIGMA_MINUTOS = 45;

/**
 * Cuánto se hunde una tienda a la que ya le dejó hoy. Es casi cero a propósito:
 * repetir cliente el mismo día es la excepción, y confundir a dos homónimas le
 * carga la entrega a quien no era.
 */
export const PENALIZA_REPETIDA = 0.1;

export interface Contexto {
  /** Minuto del día en que se está dictando. */
  minuto: number;
  /** Qué número de parada es esta dentro del día (1 = la primera). */
  posicion: number;
  /** La última tienda a la que le entregó hoy, si hubo alguna. */
  anteriorId?: number;
  /**
   * A quiénes ya les dejó producto hoy.
   *
   * Casi nunca reparte dos veces al mismo cliente en el día: cada tienda pide
   * de una vez lo que necesita. Así que si el nombre coincide con alguien a
   * quien ya le dejó, **casi seguro es otra persona con el mismo nombre** — la
   * Juanita de la parada 5 y la Juanita de la parada 35 no son la misma.
   */
  yaEntregadas?: number[];
}

export interface Candidata {
  tienda: Tienda;
  /** Ya le dejó producto hoy: lo más probable es que sea otra con su nombre. */
  yaHoy: boolean;
  puntaje: number;
  nombre: number;
  hora: number;
  secuencia: number;
  /** «parada 7 · sueles verla 10:40» — para poder elegir entre homónimas. */
  distintivo: string;
}

export type Decision = "nueva" | "ambiguo" | "encontrada";

export interface Emparejamiento {
  decision: Decision;
  /** La mejor candidata, si la decisión no fue `nueva`. */
  mejor?: Candidata;
  /** Ordenadas de mejor a peor. En `ambiguo` es lo que se muestra a elegir. */
  candidatas: Candidata[];
  /** El nombre normalizado que se buscó. "" = el dictado no nombró a nadie. */
  buscado: string;
}

export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Qué tan bien encaja la hora actual con las horas a las que suele verla.
 * Gaussiana sobre la mediana — la mediana y no el promedio, porque un día que
 * se le pinchó la llanta no debe correr el centro de toda una tienda.
 *
 * Sin historial devuelve 0.5: ni a favor ni en contra. Una tienda nueva no
 * puede perder contra una vieja solo por no tener pasado.
 */
export function puntajeHora(tienda: Tienda, minuto: number): number {
  const centro = mediana(tienda.minutos);
  if (centro === null) return 0.5;
  const d = Math.abs(minuto - centro);
  return Math.exp(-(d * d) / (2 * SIGMA_MINUTOS * SIGMA_MINUTOS));
}

/**
 * Dos señales de ruta en una: a quién suele seguir, y en qué parada suele caer.
 *
 * La primera es la más fuerte cuando existe, porque «después de ciertos
 * clientes» es exactamente como él describe su ruta.
 */
export function puntajeSecuencia(tienda: Tienda, ctx: Contexto): number {
  const partes: number[] = [];

  if (ctx.anteriorId !== undefined) {
    const veces = tienda.precedentes[ctx.anteriorId] ?? 0;
    const total = Object.values(tienda.precedentes).reduce((a, b) => a + b, 0);
    if (total > 0) partes.push(veces / total);
  }

  const centro = mediana(tienda.posiciones);
  if (centro !== null) {
    // A tres paradas de distancia ya no dice nada.
    partes.push(Math.max(0, 1 - Math.abs(ctx.posicion - centro) / 3));
  }

  if (partes.length === 0) return 0.5;
  return partes.reduce((a, b) => a + b, 0) / partes.length;
}

function distintivoDe(t: Tienda): string {
  const trozos: string[] = [];
  if (t.ordenRuta > 0) trozos.push(`parada ${t.ordenRuta}`);
  const centro = mediana(t.minutos);
  if (centro !== null) trozos.push(`sueles verla ${horaTxt(Math.round(centro))}`);
  if (trozos.length === 0) trozos.push("sin historial todavía");
  return trozos.join(" · ");
}

/** El mejor parecido contra el nombre y contra cada alias. */
function puntajeNombre(t: Tienda, buscado: string): number {
  let mejor = parecido(buscado, t.nombreNorm);
  for (const a of t.alias) {
    const p = parecido(buscado, a);
    if (p > mejor) mejor = p;
  }
  return mejor;
}

/**
 * El emparejamiento. Nunca decide sola de forma irreversible: `encontrada`
 * también se muestra en la tarjeta de confirmación y se corrige de un toque.
 */
export function emparejar(
  dictado: string,
  tiendas: Tienda[],
  ctx: Contexto,
): Emparejamiento {
  const buscado = normalizar(dictado);
  if (!buscado) return { decision: "nueva", candidatas: [], buscado };

  const candidatas = tiendas
    .map((tienda): Candidata => {
      const nombre = puntajeNombre(tienda, buscado);
      const hora = puntajeHora(tienda, ctx.minuto);
      const secuencia = puntajeSecuencia(tienda, ctx);
      const yaHoy = (ctx.yaEntregadas ?? []).includes(tienda.id!);
      return {
        tienda,
        yaHoy,
        nombre,
        hora,
        secuencia,
        // Ya servida hoy: se hunde al final, pero no se borra — a veces sí
        // vuelve a pasar, y entonces él la elige de la lista.
        puntaje:
          (PESO_NOMBRE * nombre + PESO_HORA * hora + PESO_SECUENCIA * secuencia) *
          (yaHoy ? PENALIZA_REPETIDA : 1),
        distintivo: yaHoy ? `ya le dejaste hoy · ${distintivoDe(tienda)}` : distintivoDe(tienda),
      };
    })
    // La reja: sin un nombre plausible, la tienda ni compite.
    .filter((c) => c.nombre >= UMBRAL_NOMBRE)
    .sort((a, b) => b.puntaje - a.puntaje);

  // Solo el **nombre** decide si es alguien nuevo. Una hora rara significa que
  // hoy se atrasó, no que sea otra persona: si la hora pudiera descartar,
  // bastaría un día con la llanta pinchada para crear una tienda duplicada.
  const mejor = candidatas[0];
  if (!mejor) return { decision: "nueva", candidatas, buscado };
  // Todas las que encajan ya recibieron hoy: es otra con el mismo nombre.
  if (mejor.yaHoy) return { decision: "nueva", candidatas, buscado };

  // Dos homónimas igual de probables: preguntar. Elegir mal aquí le cobra a
  // quien no era, y eso es peor que un toque más.
  const segunda = candidatas[1];
  if (segunda && mejor.puntaje - segunda.puntaje < MARGEN_AMBIGUO) {
    return { decision: "ambiguo", mejor, candidatas, buscado };
  }

  // Nombre a medias y un contexto que tampoco la respalda: se propone, pero
  // sin darla por segura. La tarjeta siempre deja crear una nueva.
  if (
    mejor.nombre < NOMBRE_SEGURO &&
    mejor.hora < CONTEXTO_FLOJO &&
    mejor.secuencia < CONTEXTO_FLOJO
  ) {
    return { decision: "ambiguo", mejor, candidatas, buscado };
  }

  return { decision: "encontrada", mejor, candidatas, buscado };
}

/** Cuántas observaciones se guardan por señal. Suficiente para ~6 semanas. */
const MEMORIA = 40;

/**
 * Aprende de una entrega confirmada. Se llama **solo al confirmar**, nunca al
 * proponer: si aprendiera de lo que propone, un error se reforzaría solo.
 */
export function aprender(t: Tienda, ctx: Contexto, dictado?: string): Tienda {
  const minutos = [...t.minutos, ctx.minuto].slice(-MEMORIA);
  const posiciones = [...t.posiciones, ctx.posicion].slice(-MEMORIA);
  const precedentes = { ...t.precedentes };
  if (ctx.anteriorId !== undefined) {
    precedentes[ctx.anteriorId] = (precedentes[ctx.anteriorId] ?? 0) + 1;
  }

  // Si la nombró de una forma que no teníamos, se guarda como alias: la
  // próxima vez el parecido no tendrá que trabajar tanto.
  const alias = [...t.alias];
  const norm = dictado ? normalizar(dictado) : "";
  if (norm && norm !== t.nombreNorm && !alias.includes(norm)) alias.push(norm);

  return {
    ...t,
    minutos,
    posiciones,
    precedentes,
    alias,
    // El orden de ruta es la parada típica, redondeada. Es lo que ordena
    // la pantalla de Cobranza.
    ordenRuta: Math.round(mediana(posiciones) ?? ctx.posicion),
    vistas: t.vistas + 1,
    ultimaVez: Date.now(),
  };
}
