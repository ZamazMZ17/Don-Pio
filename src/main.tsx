import { createRoot } from "react-dom/client";

import "@fontsource-variable/inter";
import "./estilos.css";

import App from "./App";
import { esNativo } from "./lib/plataforma";

// Sin StrictMode a propósito: la doble ejecución de efectos en desarrollo
// dispara dos veces el reconocedor de voz, y Android no deja abrir dos.
createRoot(document.getElementById("root")!).render(<App />);

// El service worker solo se registra en la versión web. En el APK los archivos
// ya están dentro de la app y registrarlo solo serviría copias viejas después
// de cada actualización.
if (!esNativo) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
