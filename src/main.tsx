import { createRoot } from "react-dom/client";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

import "@fontsource-variable/inter";
// Para los títulos: condensada, geométrica, toda en mayúsculas — ver
// `--fuente-titulo` en estilos.css. Cargada local igual que Inter, por la
// misma razón: a las 5 a.m. no hay red para pedirle nada a Google Fonts.
import "@fontsource/bebas-neue";
import "./estilos.css";

import App from "./App";
import { esNativo } from "./lib/plataforma";

// El mismo crema del splash (marca/logo.png, drawable/splash.png).
const CREMA_SPLASH = "#fae7c9";

// Para que la imagen alcance a verse aunque el teléfono cargue rapidísimo:
// sin este mínimo, en un equipo veloz el splash pasaba en un parpadeo.
const DURACION_MIN_SPLASH_MS = 1500;
let inicioSplash = 0;

async function cerrarSplash(): Promise<void> {
  const falta = DURACION_MIN_SPLASH_MS - (performance.now() - inicioSplash);
  if (falta > 0) await new Promise((resolver) => setTimeout(resolver, falta));
  await SplashScreen.hide();
  // Vuelve a transparente: es como vive el resto de la app (`--seguro-arriba`
  // depende de que la barra de estado se dibuje encima de la WebView, no al
  // lado). El color de los íconos lo retoma `useTema()` en cuanto React
  // monta, según el tema guardado — acá no hace falta adelantarlo.
  await StatusBar.setOverlaysWebView({ overlay: true });
}

function pintar(): void {
  // Sin StrictMode a propósito: la doble ejecución de efectos en desarrollo
  // dispara dos veces el reconocedor de voz, y Android no deja abrir dos.
  createRoot(document.getElementById("root")!).render(<App />);

  // Se queda puesta hasta que se cierra a mano — si no, en un teléfono lento
  // se la come el fogonazo blanco de siempre antes de que React llegue a
  // pintar nada. Dos `requestAnimationFrame` para esperar a que el primer
  // cuadro ya esté en pantalla, no solo montado.
  if (esNativo) {
    requestAnimationFrame(() => requestAnimationFrame(() => void cerrarSplash()));
  }
}

// `launchShowDuration: 0` en capacitor.config.ts apaga el splash automático
// del plugin — desde Android 12 ese camino pasa por la API nativa del
// sistema, que por diseño de Android solo puede enseñar el ícono, nunca una
// imagen completa. Por eso la imagen (el pollo con la Hilux) se pone a mano,
// lo primero de todo, con el método viejo del plugin que sí la respeta.
//
// `show()` termina de agregar la vista de la imagen en un `post()` nativo
// posterior — no es instantáneo. Si no se espera esa promesa antes de
// programar el `hide()`, éste puede llegar primero: el plugin ve que
// todavía no hay nada puesto, lo trata como si no hubiera splash que
// esconder y no lo vuelve a intentar — la imagen queda pegada en pantalla
// para siempre en vez de durar ~1 segundo. Por eso `pintar()` se llama
// recién cuando la promesa de `show()` se resuelve (o falla).
//
// El `splashImmersive`/`splashFullScreen` de capacitor.config.ts no bastaba
// para tapar la barra de estado: el hueco de arriba seguía enseñando el
// fondo oscuro de la WebView por debajo. Mientras dura el splash no hay
// CSS corriendo todavía que dependa de la barra de estado transparente
// (`--seguro-arriba`), así que acá se la pone sólida y del mismo crema.
if (esNativo) {
  inicioSplash = performance.now();
  StatusBar.setOverlaysWebView({ overlay: false })
    .then(() =>
      Promise.all([
        StatusBar.setBackgroundColor({ color: CREMA_SPLASH }),
        StatusBar.setStyle({ style: Style.Light }),
        SplashScreen.show({ autoHide: false }),
      ]),
    )
    .then(pintar, pintar);
} else {
  pintar();
}

// El service worker solo se registra en la versión web. En el APK los archivos
// ya están dentro de la app y registrarlo solo serviría copias viejas después
// de cada actualización.
if (!esNativo) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
