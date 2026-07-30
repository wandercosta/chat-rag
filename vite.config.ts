// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      // true = aceita qualquer host (Vite so valida o header Host contra uma
      // lista, dev-only). Sem isso, um site malicioso poderia enganar o
      // navegador da vitima a mandar requests pro dev server local via DNS
      // rebinding. So faz sentido com esse risco aceito propositalmente
      // (ex.: acessando via qualquer tunel, sem saber o dominio antes).
      allowedHosts: true,
    },
  },
});
