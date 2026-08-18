import { db } from "../db/db";
import { hoyISO, minutoDelDia } from "../lib/fecha";
import type { Intencion } from "./intencion";
import { interpretarLocal } from "./parserLocal";

/**
 * De una frase dictada a una intención.
 *
 * Todo esto es local: lo transcribe el teclado (Gboard) o el reconocedor
 * nativo de Android, y lo interpreta el parser de reglas, sin tocar la red.
 * Gemini quedó fuera de este camino — ver `informes.ts` para dónde sí se usa.
 */

export interface Interpretacion {
  intencion: Intencion;
  origen: "local";
  /** Lo que se oyó. Se enseña bajo la tarjeta para poder contrastarlo. */
  transcripcion: string;
  /** El id de la fila de `dictados`, para poder marcarla luego. */
  dictadoId: number;
}

/** Guarda el dictado crudo. Es lo primero que pasa, siempre. */
export async function guardarDictado(transcripcion: string): Promise<number> {
  return db.dictados.add({
    fecha: hoyISO(),
    minuto: minutoDelDia(),
    transcripcion,
    duracionMs: 0,
    estado: "procesado",
    creada: Date.now(),
  });
}

/**
 * Interpreta un dictado **al instante y sin red**.
 *
 * Lo del parser de reglas es la respuesta final: lo que no acierte se
 * corrige en la tarjeta, que para eso se enseña siempre antes de guardar.
 */
export async function interpretarYa(transcripcion: string): Promise<Interpretacion> {
  const dictadoId = await guardarDictado(transcripcion);
  const local = interpretarLocal(transcripcion);
  await db.dictados.update(dictadoId, {
    intencion: local.intencion,
    json: JSON.stringify(local),
    origen: "local",
  });
  return { intencion: local, origen: "local", dictadoId, transcripcion };
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
 * Suelta el audio de dictados viejos que todavía lo tuvieran guardado de
 * antes de que el dictado dejara de grabar audio. El texto, que es lo que de
 * verdad hay que conservar, no se toca nunca.
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
