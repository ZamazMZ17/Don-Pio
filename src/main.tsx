import { createRoot } from "react-dom/client";
import { SplashScreen } from "@capacitor/splash-screen";

import "@fontsource-variable/inter";
import "./estilos.css";

import App from "./App";
import { esNativo } from "./lib/plataforma";

// Sin StrictMode a propósito: la doble ejecución de efectos en desarrollo
// dispara dos veces el reconocedor de voz, y Android no deja abrir dos.
createRoot(document.getElementById("root")!).render(<App />);

// `launchAutoHide: false` en capacitor.config.ts deja el splash (la imagen
// del pollo con la Hilux) puesto hasta que se cierra a mano — si no, en un
// teléfono lento se lo comía el fogonazo blanco de siempre antes de que
// React llegue a pintar nada. Dos `requestAnimationFrame` para esperar a que
// el primer cuadro ya esté en pantalla, no solo montado.
if (esNativo) {
  requestAnimationFrame(() => requestAnimationFrame(() => void SplashScreen.hide()));
}

// El service worker solo se registra en la versión web. En el APK los archivos
// ya están dentro de la app y registrarlo solo serviría copias viejas después
// de cada actualización.
if (!esNativo) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
