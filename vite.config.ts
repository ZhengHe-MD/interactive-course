import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The studio frontend. In dev, Vite serves the React app on 4311 and proxies
// the API + WebSocket + live course files to the studio server on 4310.
// In production, `npm start` runs the server alone and serves the built assets.
const SERVER_PORT = Number(process.env.PORT) || 4310;
const WEB_PORT = Number(process.env.WEB_PORT) || 4311;
const http = `http://127.0.0.1:${SERVER_PORT}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: WEB_PORT,
    strictPort: true,
    watch: { ignored: ["**/.workspace/**"] },
    proxy: {
      "/api": { target: http, changeOrigin: true },
      "/course": { target: http, changeOrigin: true },
      "/__studio": { target: http, changeOrigin: true },
      "/ws": { target: `ws://127.0.0.1:${SERVER_PORT}`, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
