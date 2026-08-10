import type { ConfigIA } from "./ajustes";

/**
 * Transporte, nada más. El prompt vive en `prompts.ts` y el orquestador en
 * `interpretar.ts`, para que cambiar de proveedor toque solo este archivo.
 *
 * Está tomado casi literal de Lykari, donde ya lleva tiempo funcionando en un
 * teléfono de verdad. Lo que cambia aquí es el esquema.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** El subconjunto de JSON Schema que acepta `responseSchema`. */
export interface Esquema {
  type: "object" | "array" | "string" | "number" | "boolean" | "integer";
  properties?: Record<string, Esquema>;
  items?: Esquema;
  required?: string[];
  nullable?: boolean;
  description?: string;
  enum?: string[];
  propertyOrdering?: string[];
}

export class ErrorIA extends Error {
  constructor(
    message: string,
    readonly estado?: number,
  ) {
    super(message);
    this.name = "ErrorIA";
  }
}

function mensajeDeError(estado: number, cuerpo: unknown): string {
  const detalle =
    typeof cuerpo === "object" && cuerpo !== null && "error" in cuerpo
      ? ((cuerpo as { error?: { message?: string } }).error?.message ?? "")
      : "";
  if (estado === 400 && /API key not valid/i.test(detalle))
    return "La API key no es válida. Revísala en Ajustes.";
  if (estado === 403) return "La API key no tiene permiso para este modelo.";
  if (estado === 404) return "Ese modelo no existe o no está disponible para tu key.";
  if (estado === 429) return "Se acabó la cuota por ahora. Se reintenta más tarde.";
  if (estado === 503) return "El modelo está saturado. Se reintenta solo.";
  if (estado >= 500) return "El proveedor está fallando. Nada se perdió; se reintenta luego.";
  return detalle || `Error ${estado} del proveedor.`;
}

/** Saturación o corte momentáneo: reintentar una vez suele bastar. */
const PASAJERO = new Set([429, 500, 502, 503, 504]);
const ESPERA_REINTENTO = 4000;

export interface Audio {
  base64: string;
  mimeType: string;
}

export interface Opciones {
  prompt: string;
  esquema: Esquema;
  /** Si viene, Gemini oye el dictado original en vez de leer una transcripción. */
  audio?: Audio;
  senal?: AbortSignal;
}

export async function pedirJSON<T>(config: ConfigIA, opciones: Opciones): Promise<T> {
  try {
    return await intentar<T>(config, opciones);
  } catch (e) {
    if (!(e instanceof ErrorIA) || !e.estado || !PASAJERO.has(e.estado)) throw e;
    await new Promise((r) => setTimeout(r, ESPERA_REINTENTO));
    return intentar<T>(config, opciones);
  }
}

async function intentar<T>(config: ConfigIA, opciones: Opciones): Promise<T> {
  if (!config.apiKey) throw new ErrorIA("Falta la API key.");

  // El audio va primero: el modelo lo oye y luego lee qué hacer con él.
  const partes: unknown[] = [];
  if (opciones.audio) {
    partes.push({
      inline_data: { mime_type: opciones.audio.mimeType, data: opciones.audio.base64 },
    });
  }
  partes.push({ text: opciones.prompt });

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}/${config.modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: partes }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: opciones.esquema,
          // Bajo a propósito: aquí no se quiere creatividad, se quiere que
          // saque los mismos números todas las veces.
          temperature: 0.1,
        },
      }),
      signal: opciones.senal,
    });
  } catch {
    // Aquí cae tanto la falta de red como una petición cortada porque la app
    // se cerró. Sin afirmar cuál fue: lo que importa es que no se perdió nada.
    throw new ErrorIA("La llamada no llegó a completarse. Nada se perdió.", 0);
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    throw new ErrorIA(mensajeDeError(respuesta.status, cuerpo), respuesta.status);
  }

  const datos = (await respuesta.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };

  const candidato = datos.candidates?.[0];
  const texto = candidato?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!texto.trim()) {
    throw new ErrorIA(
      candidato?.finishReason === "MAX_TOKENS"
        ? "La respuesta se cortó por longitud."
        : "El proveedor no devolvió nada.",
    );
  }

  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new ErrorIA("El proveedor devolvió algo que no es JSON.");
  }
}
