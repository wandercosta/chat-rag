# chatrag-widget

Bundle JS publico do widget flutuante/embutido (docs/integrations/widget-embed.md).
Sem dependencias em runtime, Shadow DOM (`mode: "open"`, ADR-002 #8), ~12kB
(~3.8kB gzip). Consome so as rotas publicas em `backend/src/modules/embed`.

## Build

```bash
npm install
WIDGET_API_BASE_URL=https://api.chatrag.example npm run build
```

Gera `dist/chat-widget.js`. Sem `WIDGET_API_BASE_URL`, o build usa
`http://localhost:3333` (dev). Um build por ambiente (dev/homologacao/producao),
publicado em CDN — nao ha configuracao de API em runtime alem do override
opcional `data-api` (util so para teste local).

## Uso

```html
<script
  src="https://cdn.exemplo.com/chat-widget.js"
  data-key="pk_live_..."
  data-mode="floating"
  data-position="bottom-right"
  data-theme="sync"
  data-title="Fale com a gente"
  data-greeting="Ola! Como posso ajudar?"
  data-external-user-id="pedido-4821"
  data-visitor-name="Maria Souza"
  data-visitor-email="maria@exemplo.com"
  data-context='{"pedido":"4821","plano":"Pro"}'
  async
></script>
```

Modo embutido: `data-mode="embedded"` + `data-mount="#seletor-css"` monta
dentro de um elemento da pagina em vez de flutuar.

`data-external-user-id`/`data-visitor-name`/`data-visitor-email`/`data-context`
sao opcionais e nao assinados — ver `docs/integrations/widget-embed.md` (secao
"Identidade e contexto do visitante") para o que cada um faz e a limitacao de
seguranca de nao serem assinados.

## Teste manual sem backend

`widget/test/manual-test.html` mocka `window.fetch` e `window.open` para
exercitar o fluxo completo (config -> conversa -> mensagem -> feedback ->
handoff com selecao de setor) sem precisar do backend rodando:

```bash
npm run build
python -m http.server 4174 --directory ..   # a partir de widget/
# abrir http://localhost:4174/test/manual-test.html
```

## O que falta

- Identificacao de usuario autenticado via token assinado (campo `data-identity-token` ja existe na leitura de opcoes, mas ainda nao e enviado nas chamadas — a API tambem nao aceita esse campo ainda).
- Streaming de resposta (hoje e request/response simples).
- Testes automatizados (hoje so o roteiro manual acima).
