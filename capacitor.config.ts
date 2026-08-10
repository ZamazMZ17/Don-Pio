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
  },
};

export default config;
