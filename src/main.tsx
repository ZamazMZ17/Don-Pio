import { createRoot } from "react-dom/client";
import { SplashScreen } from "@capacitor/splash-screen";

import "@fontsource-variable/inter";
import "./estilos.css";

import App from "./App";
import { esNativo } from "./lib/plataforma";

// `launchShowDuration: 0` en capacitor.config.ts apaga el splash automático
// del plugin — desde Android 12 ese camino pasa por la API nativa del
// sistema, que por diseño de Android solo puede enseñar el ícono, nunca una
// imagen completa. Por eso la imagen (el pollo con la Hilux) se pone a mano,
// lo primero de todo, con el método viejo del plugin que sí la respeta.
if (esNativo) void SplashScreen.show({ autoHide: false });

// Sin StrictMode a propósito: la doble ejecución de efectos en desarrollo
// dispara dos veces el reconocedor de voz, y Android no deja abrir dos.
createRoot(document.getElementById("root")!).render(<App />);

// Se queda puesta hasta que se cierra a mano — si no, en un teléfono lento
// se la come el fogonazo blanco de siempre antes de que React llegue a
// pintar nada. Dos `requestAnimationFrame` para esperar a que el primer
// cuadro ya esté en pantalla, no solo montado.
if (esNativo) {
  requestAnimationFrame(() => requestAnimationFrame(() => void SplashScreen.hide()));
}

// El service worker solo se registra en la versión web. En el APK los archivos
// ya están dentro de la app y registrarlo solo serviría copias viejas después
// de cada actualización.
if (!esNativo) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
