import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = "http://127.0.0.1:4310";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4311,
    strictPort: true,
    proxy: {
      "/api": backend,
      "/course": backend,
      "/studio-preview.js": backend,
      "/studio-vendor": backend,
      "/ws": { target: backend.replace("http", "ws"), ws: true },
    },
  },
});
