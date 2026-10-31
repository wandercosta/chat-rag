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

Prioridade: atributos `data-*` do `<script>`, depois a configuracao do assistente (detalhe do assistente > Widget), depois o padrao da organizacao (Configuracoes > Aparencia padrao do widget, tabela `widget_defaults`). Campo vazio no assistente usa o padrao. Inclui titulo, saudacao, logo (endereco https, aparece no cabecalho e nas respostas), cor de destaque, tema claro/escuro/sincronizado e posicao; o modo flutuante ou embutido continua no `data-mode`. `POST /widget/config` ja devolve a aparencia juntada.

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

- `data-external-user-id`: identificador estavel do atendimento/cliente no sistema hospedeiro (ex.: id do pedido, id do chat interno). Cria/atualiza um unico registro em `visitors` (unico por `organization_id` + `external_user_id`), para o painel agrupar as conversas do mesmo cliente. **Sem assinatura, cada carregamento abre uma conversa nova**: o historico anterior nunca e devolvido.
- `data-visitor-name` / `data-visitor-email`: preenchem o cadastro do visitante.
- `data-context`: JSON livre (ex.: `{"pedido":"4821","plano":"Pro"}`) incluido no prompt do assistente como dado de personalizacao — nunca como fonte de fatos da base (a resposta continua ancorada exclusivamente no RAG).

Esses campos **nao sao assinados**: quem controla o navegador pode trocar os valores. Por isso, sozinhos, nunca devolvem historico, e um visitante ja verificado (abaixo) nunca e alterado por eles — quem tentar o id de um cliente verificado conversa como anonimo.

### Identidade assinada (`data-identity-token`)

Para o cliente logado no site retomar a conversa anterior com o historico, o **servidor** do site gera um token curto e assinado e coloca no `<script>`:

```html
<script
  src="https://cdn.exemplo.com/chat-widget.js"
  data-key="pk_live_..."
  data-identity-token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  async
></script>
```

- **Segredo:** no painel, Integracoes > chave > **Identidade** > "Gerar segredo". O texto (`wis_...`) aparece uma vez so; fica cifrado no banco (envelope, precisa voltar a texto para conferir a assinatura) e o painel mostra so o final. Trocar o segredo invalida os tokens antigos. Guarde-o so no servidor do site, nunca no HTML.
- **Formato:** JWT HS256 (`{"alg":"HS256","typ":"JWT"}`), assinado com o segredo. Claims: `sub` (id do cliente no seu sistema, obrigatorio, ate 200 caracteres), `exp` (obrigatorio, no maximo 24 horas no futuro), `name`, `email` e `context` (objeto) opcionais. Qualquer outro `alg` (inclusive `none`) e recusado.
- **Efeito:** o visitante fica marcado como verificado (`visitors.identity_verified`) e a conversa anterior dele (com o mesmo assistente) e retomada com o historico. Token invalido, vencido ou de uma chave sem segredo responde 401 em `POST /widget/conversations`.
- **Exigir assinatura:** na mesma tela, "Exigir identidade assinada" faz a chave ignorar `data-external-user-id`, nome, e-mail e contexto sem token (o visitante conversa como anonimo). Remover o segredo desliga a exigencia.

Exemplo de geracao no servidor (Node.js, sem biblioteca):

```js
import crypto from "node:crypto";

const b64 = (v) => Buffer.from(v).toString("base64url");
function tokenDoVisitante(usuario, segredo) {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(
    JSON.stringify({
      sub: usuario.id,
      name: usuario.nome,
      email: usuario.email,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const assinatura = crypto
    .createHmac("sha256", segredo)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${assinatura}`;
}
```

Qualquer biblioteca JWT com HS256 (ex.: `jsonwebtoken`, `PyJWT`, `firebase/php-jwt`) gera o mesmo token.

## Encaminhamento

O WhatsApp e configurado pela organizacao. O assistente pode fornecer contexto para selecionar setor; caso a confianca seja insuficiente ou haja mais de uma opcao aplicavel, o widget mostra botoes com os setores para o visitante escolher. A primeira versao abre WhatsApp com a ultima pergunta e identificacao permitida, sem enviar automaticamente o historico completo.

**Caixa de entrada (ADR-006).** Com "Atendimento humano pelo painel" ligado no assistente, `POST /widget/config` devolve `humanInbox: true` e o botao vira "Falar com atendente": o pedido coloca a conversa na fila do painel, o assistente para de responder e o widget abre um `EventSource` em `/widget/conversations/:id/events` para receber a resposta do atendente (identificada como "Atendente") e o aviso de encerramento. Quando a conversa e resolvida, o assistente volta a responder. Sem essa opcao, o comportamento do WhatsApp acima continua igual.

## Estado da implementacao

Bundle publico em `widget/` (~18kB, sem dependencias, ver `widget/README.md`), cobrindo config/conversa/mensagem/feedback/handoff, identidade/contexto do visitante (com ou sem assinatura, ver secoes acima), aparencia "data-* > assistente > organizacao" com logo e Shadow DOM. Falta: resposta em streaming (hoje request/response simples).
