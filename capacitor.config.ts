import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.donpio.app",
  appName: "Don Pio",
  webDir: "dist",
  android: {
    // El fondo detrás de la WebView mientras carga: si no, parpadea en blanco,
    // y a las 5 a.m. un fogonazo blanco en la cara es lo último que quieres.
    backgroundColor: "#161826",
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
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#fae7c9",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
