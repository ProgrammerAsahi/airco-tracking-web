import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { buildI18nDataElement, parseTranslationData } from "./shared/i18n";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-i18n-data",
      apply: "serve",
      async transformIndexHtml(html) {
        const file = process.env.I18N_FILE?.trim() || "test-fixtures/i18n.local.json";
        const translations = parseTranslationData(await readFile(resolve(file), "utf8"));
        return html.replace('<div id="root">', `${buildI18nDataElement(translations)}<div id="root">`);
      },
    },
  ],
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
