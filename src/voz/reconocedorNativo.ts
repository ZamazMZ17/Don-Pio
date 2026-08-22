import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * El puente al reconocedor propio (`android/.../Reconocedor.java`).
 *
 * Existe porque el plugin de la comunidad no deja pedirle al servicio de voz
 * lo que este dictado necesita: tiempos de silencio largos (él dicta con
 * pausas), preferir el reconocimiento **en el teléfono** (la espera a la red
 * era la demora que se sentía al dictar) y el resultado final repasado de
 * cada tramo, no solo los parciales.
 *
 * En un APK viejo el plugin no está registrado y cualquier llamada revienta
 * con «not implemented»: `useReconocedor` lo detecta y cae al plugin de la
 * comunidad, así que la escucha nunca se queda sin motor.
 */

/** Por qué se cerró un tramo de escucha. */
export type MotivoCorte = "resultado" | "silencio" | "red" | "idioma" | "permiso" | "error";

export interface CorteNativo {
  /** El texto final del tramo cuando `motivo` es «resultado»; "" en errores. */
  texto: string;
  motivo: MotivoCorte;
  codigo?: number;
}

interface OpcionesIniciar {
  idioma?: string;
  /** Reconocer en el teléfono si hay paquete de idioma. Falso = puede ir a la red. */
  preferirOffline?: boolean;
  /** Cuánto silencio aguanta antes de cerrar el tramo por su cuenta. */
  silencioMs?: number;
}

interface ReconocedorNativoPlugin {
  disponible(): Promise<{ disponible: boolean }>;
  iniciar(opciones: OpcionesIniciar): Promise<void>;
  detener(): Promise<void>;
  cancelar(): Promise<void>;
  addListener(evento: "parcial", fn: (d: { texto: string }) => void): Promise<PluginListenerHandle>;
  addListener(evento: "corte", fn: (d: CorteNativo) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const ReconocedorNativo = registerPlugin<ReconocedorNativoPlugin>("Reconocedor");

/** ¿El error es «este APK no trae el plugin»? Entonces toca el motor viejo. */
export function esPluginAusente(e: unknown): boolean {
  return e instanceof Error && /not implemented|no implementad/i.test(e.message);
}
