import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.donpio.app",
  appName: "Don Pio",
  webDir: "dist",
  android: {
    // El fondo detrás de la WebView mientras carga: sin esto parpadea en
    // blanco antes de que React pinte. Crema, no oscuro — el tema por
    // defecto es claro (ver estilos.css); con el fondo oscuro de antes,
    // ahora sería el splash cerrándose sobre un fogonazo oscuro en vez de
    // uno blanco, mismo problema con el color cambiado.
    backgroundColor: "#f3ecdd",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_donpio",
      iconColor: "#9184d9",
    },
    // Desde Android 12 el arranque automático del plugin (`launchShowDuration`
    // > 0) pasa por la API nativa de splash del sistema — y esa API, por
    // diseño de Android, solo puede enseñar el ícono sobre un fondo liso;
    // nuestra imagen completa (drawable/splash.png, el pollo con la Hilux)
    // no cabe ahí aunque esté bien puesta. `launchShowDuration: 0` apaga ese
    // camino automático del todo, y `main.tsx` llama a `SplashScreen.show()`
    // a mano como primera línea — eso sí usa el `drawable/splash.png`
    // completo — y la cierra en cuanto React pinta la primera pantalla.
    // `splashFullScreen`/`splashImmersive` quedan afuera a propósito: esa
    // rama del plugin intenta ocultar la barra de estado por su cuenta
    // (`controller.hide(...)`), al mismo tiempo que `main.tsx` la pone
    // sólida y crema con `@capacitor/status-bar`. Las dos peleaban por la
    // misma barra y el resultado era un hueco a medias — ni oculta ni
    // pintada. Con esto apagado, `StatusBar` manda sola.
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#fae7c9",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
