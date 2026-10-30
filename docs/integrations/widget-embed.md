# Widget integravel

## Objetivo

O widget deve ser instalado em qualquer site com um script no footer ou montado em um elemento especifico, sem modificar o backend hospedeiro.

O widget monta sua interface em Shadow DOM (`mode: 'open'`, para permitir depuracao), evitando colisao de CSS com o site hospedeiro e reduzindo risco de quebra por CSP restritivo do hospedeiro. Customizacao visual (cores, tema, logo) e aplicada via CSS custom properties que atravessam a fronteira do shadow root (ver ADR-002).

```html
<script
  src="https://cdn.exemplo.com/chat-widget.js"
  data-key="pk_live_..."
  data-mode="floating"
  async
></script>
```

## Chaves e ambientes

- Cada assistente tem chaves independentes para teste e producao.
- A chave publica identifica o widget, nunca autoriza o painel nem acesso administrativo.
- O painel cria, mostra uma vez quando aplicavel, restringe, desativa e revoga chaves.
- Uma chave possui dominios permitidos. A API valida origem/referer, aplica rate limit e registra uso.
- Limites padrao desde o MVP, por chave+dominio+IP (ver ADR-002): 60 requisicoes/minuto por chave+IP; 30 novas conversas/hora por chave+dominio; 60 mensagens/hora por conversa. Mecanismo: janela deslizante ou token bucket no Redis. Valores default sao configuraveis futuramente por tenant/plano.

## Configuracao

Prioridade: configuracao do assistente, depois padrao da organizacao. Inclui titulo, mensagem de abertura, logo, cores, tema claro/escuro/sincronizado, posicao e modo flutuante ou embutido.

## Identidade e contexto do visitante

O widget aceita, via atributos `data-*` no `<script>`, dados que o sistema hospedeiro conhece sobre o atendimento em curso:

```html
<script
  src="https://cdn.exemplo.com/chat-widget.js"
  data-key="pk_live_..."
  data-external-user-id="pedido-4821"
  data-visitor-name="Maria Souza"
  data-visitor-email="maria@exemplo.com"
  data-context='{"pedido":"4821","plano":"Pro"}'
  async
></script>
```

- `data-external-user-id`: identificador estavel do atendimento/cliente no sistema hospedeiro (ex.: id do pedido, id do chat interno). Mantido entre recargas da pagina, cria/atualiza um unico registro em `visitors` (unico por `organization_id` + `external_user_id`) e cada carregamento do widget continua abrindo uma conversa nova (`conversations`) — o ponto e permitir que o painel encontre e distinga o atendimento certo entre varias conversas, nao reaproveitar o historico de mensagens.
- `data-visitor-name` / `data-visitor-email`: preenchem o cadastro do visitante.
- `data-context`: JSON livre (ex.: `{"pedido":"4821","plano":"Pro"}`) incluido no prompt do assistente como dado de personalizacao — nunca como fonte de fatos da base (a resposta continua ancorada exclusivamente no RAG).

**Limitacao conhecida (seguranca):** esses campos nao sao assinados. Servem para hospedeiros que renderizam o `<script>` no proprio servidor com dados que ja validaram (ex.: template do backend deles, nao JS livre no navegador do visitante). Se o valor de `data-external-user-id` puder ser adivinhado ou alterado pelo proprio navegador do visitante, ele pode sobrescrever nome/email/contexto de outro atendimento com o mesmo id — nao ha vazamento de historico de conversa (o widget nunca busca conversas antigas de um visitante), mas ha risco de poluir o contexto usado no prompt de um atendimento legitimo. Uma integracao autenticada futura, com um token curto assinado pelo backend hospedeiro carregando `external_user_id`/nome/contexto, fecha essa lacuna — ainda nao implementada.

## Encaminhamento

O WhatsApp e configurado pela organizacao. O assistente pode fornecer contexto para selecionar setor; caso a confianca seja insuficiente ou haja mais de uma opcao aplicavel, o widget mostra botoes com os setores para o visitante escolher. A primeira versao abre WhatsApp com a ultima pergunta e identificacao permitida, sem enviar automaticamente o historico completo.

**Caixa de entrada (ADR-006).** Com "Atendimento humano pelo painel" ligado no assistente, `POST /widget/config` devolve `humanInbox: true` e o botao vira "Falar com atendente": o pedido coloca a conversa na fila do painel, o assistente para de responder e o widget abre um `EventSource` em `/widget/conversations/:id/events` para receber a resposta do atendente (identificada como "Atendente") e o aviso de encerramento. Quando a conversa e resolvida, o assistente volta a responder. Sem essa opcao, o comportamento do WhatsApp acima continua igual.

## Estado da implementacao

Bundle publico em `widget/` (~13kB, sem dependencias, ver `widget/README.md`), cobrindo config/conversa/mensagem/feedback/handoff, identidade/contexto do visitante (nao assinados, ver secao acima) e Shadow DOM. Diferencas do desenhado acima: titulo/saudacao/tema/posicao vem hoje de atributos `data-*` no `<script>`, nao de configuracao do assistente buscada da API (a hierarquia "assistente > organizacao" ainda nao existe); sem customizacao de logo; sem token de identidade autenticada assinado; resposta e request/response simples, sem streaming.
