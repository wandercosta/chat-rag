# API REST publica e webhooks de saida

Etapa 8 do ADR-006. Integra o ChatRAG a sistemas do cliente (ERP, site, planilhas, automacoes externas) sem acesso ao painel. Telas: **API e webhooks** (`/api-webhooks`, so Administrador).

## Tokens da API

- Criados pelo Administrador com um nome e escopos: `contacts:read`, `contacts:write`, `conversations:read`. O texto do token (`crg_...`) aparece uma unica vez; o banco guarda so o hash (sha256) e um prefixo para reconhecer o token na lista.
- Envio: `Authorization: Bearer crg_...`. Token invalido ou revogado: 401. Escopo que falta: 403. Organizacao suspensa: 403.
- O token ja carrega a organizacao: nenhuma rota `/api/v1` recebe `organizationId`, entao um token nunca enxerga outro tenant (registro de outro tenant responde 404).
- Limite: 120 chamadas por minuto por token (janela de minuto no Redis). Acima disso: 429 com `Retry-After`. Cabecalhos `X-RateLimit-Limit` e `X-RateLimit-Remaining` em toda resposta autenticada.
- Responsavel humano (ADR-006 #3): quem criou o token responde pelo que ele faz. Escrita pela API vai para a auditoria com o nome do token; se a pessoa que criou o token for removida, ele so le (escrita responde 403).
- Revogacao imediata pelo painel (auditada). Limite de 20 tokens ativos por organizacao.

### Rotas v1

| Metodo e rota                   | Escopo               | O que faz                                                                     |
| ------------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| `GET /api/v1/contacts`          | `contacts:read`      | Lista contatos (`?search=`, `?page=`, 50 por pagina), com etiquetas e opt-in. |
| `GET /api/v1/contacts/:id`      | `contacts:read`      | Um contato.                                                                   |
| `POST /api/v1/contacts`         | `contacts:write`     | Cria contato (`name`, `email`, `phone`, `optIn`, `customFields`).             |
| `GET /api/v1/conversations`     | `conversations:read` | Ultimas 100 conversas (`?from=`, `?to=` em ISO 8601).                         |
| `GET /api/v1/conversations/:id` | `conversations:read` | Conversa com as mensagens (`role`, `content`, `createdAt`).                   |

Os corpos de resposta tem formato proprio (camelCase), montado na rota: coluna nova no banco nao vaza sem decisao. Notas internas nao saem pela API.

## Webhooks de saida

- Cadastro pelo Administrador: URL e eventos. Ate 10 por organizacao. Ligar/desligar, trocar segredo, enviar teste e ver as ultimas entregas pelo painel.
- Eventos: `mensagem.recebida` (mensagem do visitante em qualquer canal), `conversa.resolvida` (caixa de entrada), `contato.criado` (painel, importacao, widget, canais ou API). Importar um CSV gera um evento por contato novo.
- Corpo (POST JSON):

```json
{
  "id": "<id da entrega>",
  "event": "mensagem.recebida",
  "organizationId": "<uuid>",
  "occurredAt": "2026-10-30T12:00:00.000Z",
  "data": {
    "conversationId": "...",
    "messageId": "...",
    "channel": "whatsapp",
    "contactId": "...",
    "content": "...",
    "createdAt": "..."
  }
}
```

- Cabecalhos: `X-ChatRAG-Event`, `X-ChatRAG-Delivery` (id da entrega, use para ignorar repeticao) e `X-ChatRAG-Signature: t=<unix>,v1=<hex>`.
- Verificacao: `v1 = HMAC-SHA256(segredo, "<t>.<corpo cru>")`, comparado em tempo constante; recuse `t` com mais de 5 minutos de diferenca. O segredo (`whsec_...`) aparece uma vez ao criar ou trocar; no banco fica num envelope cifrado (`src/crypto/envelope.ts`) porque precisa voltar a texto para assinar.
- Entrega pela fila `webhooks` no worker: resposta 2xx em ate 10 segundos conta como entregue; qualquer outra coisa tenta de novo (6 tentativas, espera exponencial a partir de 30 segundos, cerca de meia hora no total). Redirecionamento nao e seguido. Sem sucesso na ultima tentativa, a entrega fica como "falhou".
- Emitir evento e melhor esforco: falha ao registrar a entrega nunca derruba a acao que gerou o evento.

### Protecao contra SSRF

- So `https://` e sem usuario/senha na URL.
- Antes de cada entrega o host e resolvido e qualquer endereco privado, loopback, link-local (inclui `169.254.169.254`), CGNAT, ULA ou multicast e recusado. A conferencia repete a cada tentativa porque o DNS pode mudar depois do cadastro.
- `WEBHOOKS_ALLOW_PRIVATE_NETWORK=true` desliga essas travas e libera `http://`. Existe so para testes e desenvolvimento local; nunca em producao.

### Dados pessoais

O conteudo das mensagens e os dados do contato vao para a URL que o proprio cliente cadastrou (controlador dos dados). Quem cadastra e o Administrador, e o cadastro fica na auditoria.

## Metricas por atendente

`GET /organizations/:id/agent-metrics?days=7|30|90` (Administrador e Analista; tela **Desempenho da equipe**, `/desempenho`): por pessoa, conversas atribuidas, resolvidas, mensagens enviadas e tempo de primeira resposta (mediana e media, do pedido de atendimento humano ate a primeira resposta de atendente, creditado a quem respondeu primeiro); da equipe, pedidos, fila sem atendente agora, resolvidas e mediana da primeira resposta.
