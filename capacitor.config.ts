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
    // Desde Android 12 el sistema se salta el `drawable/splash.png` de
    // siempre y solo enseña el ícono sobre un fondo liso — este plugin es
    // la única forma soportada de volver a mostrar una imagen completa
    // (la del pollo con la Hilux) al abrir. `androidSplashResourceName`
    // apunta al mismo `splash.png` ya generado por densidad/orientación;
    // `main.ts` la cierra a mano en cuanto React pinta la primera pantalla.
    SplashScreen: {
      launchAutoHide: false,
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
