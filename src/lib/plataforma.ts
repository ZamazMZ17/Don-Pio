import { Capacitor } from "@capacitor/core";

/**
 * `true` dentro del APK, `false` como PWA o en el navegador de desarrollo.
 *
 * Lo que de verdad cambia entre los dos: el reconocimiento de voz (nativo y
 * offline en el APK, Web Speech API — que necesita internet — en el navegador)
 * y la vibración.
 */
export const esNativo = Capacitor.isNativePlatform();
