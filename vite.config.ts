import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * La versión que se ve en Ajustes: fecha del build y commit. Es lo que le
 * permite saber si el APK que tiene puesto es el último que se publicó.
 */
function versionDelBuild(): string {
  const fecha = new Date().toISOString().slice(0, 10);
  try {
    const commit = execSync("git rev-parse --short HEAD").toString().trim();
    return `${fecha} · ${commit}`;
  } catch {
    return fecha;
  }
}

export default defineConfig({
  define: { __VERSION_APP__: JSON.stringify(versionDelBuild()) },
  plugins: [
    react(),
    // El manifiesto y el service worker se generan siempre, pero en el APK no
    // se registran (ver src/main.tsx): ahí los archivos ya están dentro de la
    // app y un service worker solo serviría copias viejas tras actualizar.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icono-180.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
      },
      manifest: {
        name: "Don Pio",
        short_name: "Don Pio",
        description: "Control de reparto de pollos, por voz.",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#161826",
        theme_color: "#161826",
        icons: [
          { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icono-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
