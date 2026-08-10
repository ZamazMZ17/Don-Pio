import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { esNativo } from "./plataforma";

/**
 * Sonido y vibración de confirmación.
 *
 * No es un adorno: él dicta mientras maneja o mientras carga, y si no siente
 * que quedó registrado va a mirar la pantalla. El aviso es lo que le permite
 * no mirarla (CLAUDE.md §2).
 */

let sonidoActivo = true;

export function configurarAviso(activo: boolean): void {
  sonidoActivo = activo;
}

/** Un pitido corto sintetizado. Sin archivos: nada que descargar ni que falte. */
function pitar(frecuencia: number, ms: number, volumen = 0.18): void {
  if (!sonidoActivo) return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frecuencia;
    gan.gain.setValueAtTime(volumen, ctx.currentTime);
    // Se apaga con una rampa: un corte seco suena a chasquido.
    gan.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.connect(gan).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
    osc.onended = () => void ctx.close();
  } catch {
    // Si el navegador no deja sonar todavía (falta un toque del usuario), la
    // vibración sigue haciendo su trabajo.
  }
}

function vibrar(estilo: ImpactStyle): void {
  if (!esNativo) {
    navigator.vibrate?.(estilo === ImpactStyle.Heavy ? 40 : 18);
    return;
  }
  void Haptics.impact({ style: estilo }).catch(() => {});
}

/** Empezó a escuchar. */
export function avisoEscuchando(): void {
  vibrar(ImpactStyle.Light);
  pitar(660, 90);
}

/** Dejó de escuchar y hay algo que confirmar. */
export function avisoEntendido(): void {
  vibrar(ImpactStyle.Light);
  pitar(880, 110);
}

/** Quedó registrado. Es el aviso que más importa. */
export function avisoGuardado(): void {
  if (esNativo) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  else navigator.vibrate?.([25, 40, 25]);
  pitar(880, 90);
  setTimeout(() => pitar(1180, 130), 100);
}

/** Algo no se entendió o hace falta decidir. */
export function avisoAtencion(): void {
  if (esNativo) void Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  else navigator.vibrate?.([40, 60, 40]);
  pitar(420, 180, 0.15);
}
