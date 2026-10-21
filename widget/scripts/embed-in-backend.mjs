// Copia o bundle do widget para o backend, que o serve em GET /chat-widget.js
// sem depender de arquivo no disco do container.
// Uso: npm run build:embed (gera dist/ e atualiza o backend).
import { readFile, writeFile } from "node:fs/promises";

const bundle = await readFile(new URL("../dist/chat-widget.js", import.meta.url), "utf8");
const target = new URL("../../backend/src/modules/embed/widget-code.ts", import.meta.url);

// JSON.stringify gera um literal de string valido em TypeScript, sem precisar
// escapar crases e ${ de um template literal.
await writeFile(
  target,
  "// Gerado por widget/scripts/embed-in-backend.mjs — nao edite a mao.\n" +
    `export const WIDGET_SCRIPT_CONTENT = ${JSON.stringify(bundle)};\n`,
);
console.log(`widget embutido no backend (${bundle.length} bytes)`);
