import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    // Proxy API calls to the local Node server so the browser always reads
    // inventory through the same-origin /api/inventory endpoint.
    proxy: {
      "/api": "http://127.0.0.1:4174",
      "/health": "http://127.0.0.1:4174",
    },
  },
});
