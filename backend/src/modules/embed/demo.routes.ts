import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";

/**
 * Pagina de demonstracao do widget: um site ficticio com o <script> de
 * instalacao, usando a chave criada pelo seed (DEMO_WIDGET_KEY). So existe
 * quando a variavel esta definida — em producao ela nao e configurada.
 */
function demoPage(key: string, apiBase: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Loja Exemplo — Central do Consumidor</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f7fb; color: #1f2430; }
    header { background: #1f2430; color: #fff; padding: 18px 24px; }
    header strong { font-size: 18px; }
    main { max-width: 760px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 28px; margin: 0 0 12px; }
    p { line-height: 1.6; color: #4a5160; }
    .card { background: #fff; border: 1px solid #e3e6ee; border-radius: 12px; padding: 20px 24px; margin-top: 24px; }
    .card li { margin: 6px 0; color: #4a5160; }
    small { color: #8a90a0; }
  </style>
</head>
<body>
  <header><strong>Loja Exemplo</strong> · site ficticio de demonstracao</header>
  <main>
    <h1>Central do Consumidor</h1>
    <p>Duvidas sobre troca, garantia ou arrependimento de compra? O assistente no canto da tela
      responde com base no Codigo de Defesa do Consumidor (Lei 8.078/1990) e mostra o trecho da lei
      usado em cada resposta.</p>
    <div class="card">
      <strong>Experimente perguntar:</strong>
      <ul>
        <li>Comprei pela internet. Em quantos dias posso desistir da compra?</li>
        <li>Qual o prazo para reclamar de defeito em um produto durável?</li>
        <li>O fornecedor pode me cobrar uma divida com ameaca?</li>
      </ul>
    </div>
    <p><small>Pagina servida pela API do ChatRAG em <code>/demo</code>. O widget e o mesmo script que
      um cliente instalaria no proprio site.</small></p>
  </main>
  <script src="${apiBase}/chat-widget.js" data-key="${key}" data-api="${apiBase}" async></script>
</body>
</html>`;
}

export async function demoRoutes(app: FastifyInstance) {
  app.get("/demo", async (request, reply) => {
    if (!env.DEMO_WIDGET_KEY) return reply.code(404).send({ error: "demo desativada" });
    const apiBase = `${request.protocol}://${request.headers.host}`;
    return reply.type("text/html; charset=utf-8").send(demoPage(env.DEMO_WIDGET_KEY, apiBase));
  });
}
