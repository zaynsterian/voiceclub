import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true
  },
  build: {
    target: "es2020"
  }
});
