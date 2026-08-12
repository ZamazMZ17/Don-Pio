import { db } from "../db/db";
import { hoyISO, minutoDelDia } from "../lib/fecha";
import { configuracionIA } from "./ajustes";
import { pedirJSON } from "./gemini";
import { sanear, type Intencion } from "./intencion";
import { interpretarLocal } from "./parserLocal";
import { ESQUEMA_INTENCION, promptAudio, promptDe } from "./prompts";
import { aBase64 } from "./grabacion";

/**
 * De una frase dictada a una intención.
 *
 * El orden no es negociable y es la regla que manda sobre toda la app:
 *
 *   1. Se guarda el dictado **antes** de llamar a nadie.
 *   2. El parser local lo interpreta al instante, sin red.
 *   3. Si hay señal y hay key, Gemini lo repasa y afina lo que el parser dejó
 *      a medias.
 *
 * Así, a las 5 a.m. en un sótano sin cobertura, la entrega queda registrada
 * igual. Si el paso 3 falla o ni se intenta, el dictado queda en la cola y se
 * repasa cuando vuelva el internet: nunca se pierde nada de lo dicho.
 */

export interface Interpretacion {
  intencion: Intencion;
  origen: "gemini" | "local";
  /** Lo que se oyó. Se enseña bajo la tarjeta para poder contrastarlo. */
  transcripcion: string;
  /** El id de la fila de `dictados`, para poder marcarla luego. */
  dictadoId: number;
  /** Por qué no se usó Gemini, si no se usó. Se muestra discreto en la tarjeta. */
  aviso?: string;
}

export function hayInternet(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** Guarda el dictado crudo. Es lo primero que pasa, siempre. */
export async function guardarDictado(
  transcripcion: string,
  extra: { audioBlob?: Blob; duracionMs?: number } = {},
): Promise<number> {
  return db.dictados.add({
    fecha: hoyISO(),
    minuto: minutoDelDia(),
    transcripcion,
    audioBlob: extra.audioBlob,
    duracionMs: extra.duracionMs ?? 0,
    estado: "pendiente",
    creada: Date.now(),
  });
}

/** Le pide a Gemini que estructure el texto. Lanza si no puede. */
export async function conGemini(transcripcion: string): Promise<Intencion> {
  const config = await configuracionIA();
  const nombres = (await db.tiendas.toArray()).map((t) => t.nombre);
  const bruto = await pedirJSON<Record<string, unknown>>(config, {
    prompt: promptDe(transcripcion, nombres),
    esquema: ESQUEMA_INTENCION,
  });
  return sanear(bruto);
}

/**
 * El camino bueno: Gemini **oye el audio** y devuelve los campos ya sacados,
 * junto con lo que entendió palabra por palabra.
 *
 * Devuelve también la transcripción porque es lo que se enseña bajo la tarjeta
 * de confirmación: si el total no cuadra, él tiene que poder ver qué se oyó.
 */
export async function conGeminiAudio(
  blob: Blob,
): Promise<{ intencion: Intencion; transcripcion: string }> {
  const config = await configuracionIA();
  const nombres = (await db.tiendas.toArray()).map((t) => t.nombre);
  const base64 = await aBase64(blob);

  const bruto = await pedirJSON<Record<string, unknown>>(config, {
    prompt: promptAudio(nombres),
    esquema: ESQUEMA_INTENCION,
    // El tipo lleva a veces `;codecs=opus`, que la API no admite.
    audio: { base64, mimeType: (blob.type || "audio/webm").split(";")[0] },
  });

  return {
    intencion: sanear(bruto),
    transcripcion: typeof bruto.transcripcion === "string" ? bruto.transcripcion.trim() : "",
  };
}

/**
 * Interpreta un dictado grabado. El audio se guarda **antes** de llamar a
 * nadie, así que si Gemini falla no se pierde: queda en la cola.
 */
export async function interpretarAudio(
  grabacion: { blob: Blob; duracionMs: number },
  respaldo: string,
): Promise<Interpretacion> {
  const dictadoId = await guardarDictado(respaldo, {
    audioBlob: grabacion.blob,
    duracionMs: grabacion.duracionMs,
  });

  try {
    const { intencion, transcripcion } = await conGeminiAudio(grabacion.blob);
    await db.dictados.update(dictadoId, {
      transcripcion: transcripcion || respaldo,
      intencion: intencion.intencion,
      json: JSON.stringify(intencion),
      origen: "gemini",
      estado: "procesado",
    });
    return { intencion, origen: "gemini", dictadoId, transcripcion: transcripcion || respaldo };
  } catch (e) {
    // Gemini falló, pero el audio ya está guardado. Se sigue con lo que saque
    // el parser de reglas del respaldo, y él corrige en la tarjeta.
    const local = interpretarLocal(respaldo);
    const aviso = e instanceof Error ? e.message : "No se pudo consultar la IA";
    await db.dictados.update(dictadoId, {
      intencion: local.intencion,
      json: JSON.stringify(local),
      origen: "local",
      estado: "pendiente",
      error: aviso,
    });
    return { intencion: local, origen: "local", dictadoId, transcripcion: respaldo, aviso };
  }
}

export async function interpretar(
  transcripcion: string,
  extra: { audioBlob?: Blob; duracionMs?: number } = {},
): Promise<Interpretacion> {
  const dictadoId = await guardarDictado(transcripcion, extra);
  const local = interpretarLocal(transcripcion);
  const config = await configuracionIA();

  const anotar = async (
    intencion: Intencion,
    origen: "gemini" | "local",
    error?: string,
    pendiente = true,
  ) => {
    await db.dictados.update(dictadoId, {
      intencion: intencion.intencion,
      json: JSON.stringify(intencion),
      origen,
      // `local` queda pendiente solo si hay algo que esperar: la cola lo
      // repasará con Gemini cuando vuelva la señal.
      estado: origen === "gemini" || !pendiente ? "procesado" : "pendiente",
      error,
    });
  };

  if (!config.apiKey) {
    // Sin key no hay nada que repasar: lo del parser es la respuesta final, y
    // dejarlo «pendiente» solo llenaba el contador de arriba para siempre.
    await anotar(local, "local", undefined, false);
    return { intencion: local, origen: "local", dictadoId, transcripcion, aviso: "Sin API key" };
  }

  if (!hayInternet()) {
    await anotar(local, "local");
    return { intencion: local, origen: "local", dictadoId, transcripcion, aviso: "Sin señal" };
  }

  try {
    const remota = await conGemini(transcripcion);
    await anotar(remota, "gemini");
    return { intencion: remota, origen: "gemini", dictadoId, transcripcion };
  } catch (e) {
    // Gemini falló, pero el parser local ya tiene algo: se sigue adelante con
    // eso. Quedarse sin registrar la entrega sería mucho peor que registrarla
    // con un dato a medias que él puede corregir en la tarjeta.
    const aviso = e instanceof Error ? e.message : "No se pudo consultar la IA";
    await anotar(local, "local", aviso);
    return { intencion: local, origen: "local", dictadoId, transcripcion, aviso };
  }
}

/** Marca un dictado como convertido en entrega, para poder rastrearlo. */
export async function ligarAEntrega(dictadoId: number, entregaId: number): Promise<void> {
  await db.dictados.update(dictadoId, { entregaId });
}

export async function descartarDictado(dictadoId: number): Promise<void> {
  await db.dictados.update(dictadoId, { estado: "descartado" });
}

/** Cuántos días se guarda el audio de un dictado ya resuelto antes de soltarlo. */
const DIAS_AUDIO = 3;

/**
 * Suelta el audio de los dictados ya resueltos hace unos días.
 *
 * El audio solo sirve una vez, en el intento inicial con Gemini: ni el
 * reintento de la cola (que manda solo el texto, ver `cola.ts`) ni ninguna
 * pantalla lo vuelven a leer. Guardarlo para siempre solo llena el teléfono
 * — con 50 y pico dictados al día, en unas semanas serían miles de audios
 * sin ningún uso. El texto, que es lo que de verdad hay que conservar, no
 * se toca nunca.
 */
export async function limpiarAudiosViejos(): Promise<number> {
  const limite = Date.now() - DIAS_AUDIO * 24 * 60 * 60 * 1000;
  const viejos = await db.dictados
    .where("estado")
    .anyOf("procesado", "descartado")
    .filter((d) => d.creada < limite && d.audioBlob !== undefined)
    .toArray();

  for (const d of viejos) await db.dictados.update(d.id!, { audioBlob: undefined });
  return viejos.length;
}

