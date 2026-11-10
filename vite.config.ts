import { defineConfig } from "vite";

// Tauri ожидает dev-сервер на фиксированном порту (см. src-tauri/tauri.conf.json → build.devUrl).
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
