import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/gpt-paketeraren/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "GPT Paketeraren",
        short_name: "GPT Paketeraren",
        description: "Paketera GPT-instruktioner och Knowledge lokalt i webbläsaren.",
        theme_color: "#111827",
        background_color: "#f8fafc",
        display: "standalone",
        lang: "sv",
        start_url: "/gpt-paketeraren/",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
      }
    })
  ]
});
