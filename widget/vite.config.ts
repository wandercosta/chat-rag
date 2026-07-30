import { resolve } from "node:path";
import { defineConfig } from "vite";

// Bundle unico, sem dependencias externas (docs/integrations/widget-embed.md:
// "leve e independente da stack do site hospedeiro"). A URL da API e fixada
// no build (um build por ambiente), com override via data-api so para dev/teste local.
const API_BASE_URL = process.env.WIDGET_API_BASE_URL ?? "http://localhost:3333";

export default defineConfig({
  define: {
    __CHATRAG_DEFAULT_API_BASE_URL__: JSON.stringify(API_BASE_URL),
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/main.ts"),
      name: "ChatRagWidget",
      formats: ["iife"],
      fileName: () => "chat-widget.js",
    },
    outDir: "dist",
    minify: true,
    emptyOutDir: true,
  },
});
