# Contratos de API planejados

Estes contratos definem limites e responsabilidade. Rotas, campos e formatos finais serao documentados antes da implementacao — a lista abaixo, em "Rotas implementadas", reflete o que ja existe em `backend/src` e pode mudar sem aviso ate a Fase 1 estar fechada (nao e um contrato congelado).

## Painel autenticado

- Gestao de organizacoes, usuarios, assistentes, colecoes, topicos e fontes.
- Solicitacao e consulta de indexacao.
- Playground de conversa.
- Chaves, dominios, configuracao do widget e revogacao.
- Configuracao, validacao, substituicao, reutilizacao por ambiente e remocao da chave OpenAI do tenant, sem endpoint de leitura do segredo.
- Listagem de modelos permitidos para o tenant e selecao de modelo do assistente dentro dessa lista.
- Conversas, feedbacks, lacunas, uso e auditoria.

## Widget publico

- Carregar configuracao publica por chave valida e origem permitida.
- Criar/retomar conversa de visitante.
- Enviar mensagem e receber resposta em streaming ou polling curto.
- Registrar feedback.
- Gerar encaminhamento para WhatsApp.

## Regras

- Nao existe endpoint publico de registro de tenant ou usuario; provisionamento requer sessao Master.
- O widget nao recebe token administrativo.
- Limites de origem, chave, IP e conversa sao aplicados no servidor.
- Contexto de usuario autenticado exige token assinado pelo sistema hospedeiro.
- Toda chamada de IA resolve a credencial ativa do proprio tenant; nao aceita chave de IA enviada pelo widget ou pelo navegador.
- Sem credencial valida, fontes podem ser cadastradas, mas indexacao e chat retornam estado de ativacao pendente sem tentar usar chave da plataforma.
- Mudancas de payload exigem versao/compatibilidade e testes de contrato.
- Dado invalido (corpo, parametro ou query) responde 400 com `error` (motivo do primeiro problema) e `issues`.

## Rotas implementadas (backend/src, sujeitas a mudanca ate Fase 1 fechar)

Painel (sessao via cookie; `:organizationId` sempre resolvido pela sessao/membership, nunca aceito livremente):

- `POST /auth/login` (`{ email, password, code? }`; com 2FA ativo e sem `code`: 401 com `twoFactorRequired`; 10 erros em 15 minutos por e-mail: 429), `POST /auth/logout`, `GET /auth/me` (inclui `twoFactorEnabled`)
- `GET /auth/2fa` (estado), `POST /auth/2fa/setup` (gera a chave; 409 se ja ativo), `POST /auth/2fa/enable` (`{ code }`; devolve os codigos de recuperacao uma unica vez), `POST /auth/2fa/disable` (`{ code }`, do app ou de recuperacao)
- `GET /organizations/:organizationId/export` (Administrador; JSON da organizacao para LGPD, auditado)
- `GET|POST /organizations/:organizationId/api-tokens` (`{ name, scopes }`; o texto do token volta so na criacao), `DELETE .../api-tokens/:tokenId` (revoga) — so Administrador
- `GET|POST /organizations/:organizationId/webhooks` (`{ url, events }`; o segredo volta so na criacao; URL fora de https ou para rede interna: 422), `PATCH .../webhooks/:webhookId` (`url`, `events`, `enabled`), `POST .../webhooks/:webhookId/rotate-secret`, `POST .../webhooks/:webhookId/test` (202), `GET .../webhooks/:webhookId/deliveries`, `DELETE .../webhooks/:webhookId` — so Administrador
- `GET /organizations/:organizationId/agent-metrics?days=` (1 a 90, padrao 30; Administrador e Analista)

## API publica v1 (token de API)

Autenticacao por `Authorization: Bearer crg_...`; 401 token invalido/revogado, 403 escopo que falta ou organizacao suspensa, 429 acima de 120 chamadas por minuto por token. Detalhes e formato dos webhooks em `docs/integrations/api-e-webhooks.md`.

- `GET /api/v1/contacts` (`contacts:read`; `?search=`, `?page=`), `GET /api/v1/contacts/:id`, `POST /api/v1/contacts` (`contacts:write`; 409 duplicado, 422 e-mail/telefone invalido)
- `GET /api/v1/conversations` (`conversations:read`; `?from=`, `?to=`), `GET /api/v1/conversations/:id` (com mensagens)
- `GET|POST /master/tenants`, `POST /master/tenants/:organizationId/status`
- `GET|POST /master/tenants/:organizationId/support-sessions`, `POST .../support-sessions/:sessionId/end` (justificativa + expiracao, auditado — ADR-001 #14)
- `GET /organizations/:organizationId` (auto-atendimento do tenant: nome/status da propria organizacao)
- `PUT /organizations/:organizationId/retention` (`{ days: number | null, mode?: "excluir" | "anonimizar" }`, politica de retencao da organizacao; `GET /organizations/:organizationId` traz `retention_mode`)
- `GET /organizations/:organizationId/roles` (papeis da tabela `roles` com a descricao, em ordem; so Administrador)
- `GET|POST /organizations/:organizationId/ai-credentials`, `DELETE .../ai-credentials/:environment`
- `GET /master/tenants/:organizationId/channels` (estado dos canais do tenant: provedor, nome, numero/Pagina, estado e motivo; sem segredo; exige sessao de suporte ativa)
- `GET /organizations/:organizationId/channels/embedded-signup` (`{ config: { appId, configId } | null }`), `POST .../channels/whatsapp/embedded` (`{ name, assistantId, code, phoneNumberId, wabaId }`; 409 sem app da plataforma; 422 se a Meta recusar o code) — so Administrador; `GET|POST /webhooks/whatsapp` (webhook unico do app da plataforma, assinado com `META_APP_SECRET`)
- `GET /master/tenants/:organizationId/ai-credentials`, `DELETE .../ai-credentials/:environment` (suporte Master, so estado, exige sessao de suporte ativa)
- `GET|POST|PATCH /organizations/:organizationId/assistants[/:assistantId]`
- `GET|POST|PATCH /master/model-catalog[/:modelId]`, `GET|PUT /master/tenants/:organizationId/allowed-models`, `GET /organizations/:organizationId/allowed-models`
- `GET|POST|DELETE /organizations/:organizationId/assistants/:assistantId/handoff-configs[/:configId]` (setores de WhatsApp)
- `GET|POST /organizations/:organizationId/collections`, `GET|PUT|DELETE .../assistants/:assistantId/collections[/:collectionId]` (escopo de conhecimento do assistente — ver ADR-003)
- `GET|POST /organizations/:organizationId/topics`, `PATCH .../topics/:topicId` (inclusive mover o topico entre colecoes)
- `GET /organizations/:organizationId/topics/:topicId/sources`, `POST .../sources`, `POST .../sources/upload` (multipart), `POST .../sources/:sourceId/{approve,reindex,archive}`, `POST .../sources/:sourceId/review` (`{ reviewed }`, marca ou tira a revisao; 409 em fonte aguardando revisao ou arquivada; a fonte traz `reviewed_at`/`reviewed_by`; o assistente aceita `reviewedSourcesOnly`), `POST .../sources/activate-pending` (destrava fontes presas em `aguardando_ativacao` apos uma chave de IA valida existir)
- `POST /organizations/:organizationId/assistants/:assistantId/playground-messages` (com `Accept: text/event-stream`, responde em SSE: `{ type: "delta", text }` enquanto o modelo escreve e `{ type: "done", ...resposta }` no fim; `{ type: "error", error }` se falhar depois de comecar)
- `GET /organizations/:organizationId/conversations[/:conversationId]`, `POST .../feedback` (o detalhe traz `attachments` em cada mensagem: id, tipo, nome, tamanho, estado e erro, sem a chave do storage; o detalhe da caixa de entrada tambem)
- `PATCH /organizations/:organizationId/channels/:id` com `{ humanAgentTag: boolean }` (so Administrador; so Messenger e Instagram, 404 nos outros): liga a tag "Agente humano" da Meta, que estende a janela do atendente para 7 dias; devolve `{ id, provider, config }` e vai para a auditoria
- `GET /organizations/:organizationId/conversations/:conversationId/attachments/:attachmentId` (arquivo recebido pelo canal; Administrador, Atendente e Analista, ou Master em sessao de suporte; sempre `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff`; 404 se o anexo nao e daquela conversa e organizacao ou ainda nao esta pronto)
- `GET /organizations/:organizationId/gaps`, `POST .../gaps/:gapId/resolve`, `POST .../gaps/:gapId/answer` (responder a lacuna cria uma fonte de texto no topico indicado — mesmo pipeline de qualquer outra fonte — e marca a lacuna como resolvida; papeis Administrador/Editor de base)
- `GET|POST /organizations/:organizationId/widget-keys`, `POST .../revoke`, `POST|DELETE .../domains[/:domainId]` (a lista nunca traz o hash da chave nem o segredo de identidade; traz `identity_secret_hint` e `require_signed_identity`)
- `POST|DELETE /organizations/:organizationId/widget-keys/:keyId/identity-secret` (gera/troca o segredo de identidade e devolve `{ secret, hint }` uma vez so; remover desliga a exigencia), `PATCH .../widget-keys/:keyId` (`{ requireSignedIdentity }`, 422 sem segredo) — so Administrador, com auditoria de seguranca
- `GET|PUT /organizations/:organizationId/widget-defaults` (aparencia padrao do widget: `title`, `greeting`, `accentColor`, `position`, `theme`, `logoUrl` https; so Administrador). `widgetSettings` do assistente aceita os mesmos campos
- `GET|POST /organizations/:organizationId/members`, `PATCH|DELETE .../members/:membershipId` (acessos do tenant; senha provisoria definida pelo administrador, sem cadastro publico; a organizacao nunca fica sem administrador)
- `GET /organizations/:organizationId/audit`
- `GET /organizations/:organizationId/usage` (resumo agregado — ver limitacoes em `docs/README.md`)
- `GET /master/usage?days=1..90` (so Master; padrao 30): consumo cruzando tenants, so contagens — `totals` (organizacoes com atividade, conversas, mensagens recebidas, respostas do assistente e de atendentes, perguntas ao assistente, sem contexto, latencia media), `conversationsByChannel`, `messagesReceivedPerDay` e `organizations[]` com as mesmas contagens por `organizationId`, da mais ativa para a menos. Nenhum conteudo de conversa ou dado de contato; custo estimado fica de fora ate existir tabela de precos por modelo.
- `GET /organizations/:organizationId/inbox?view=fila|minhas|abertas|resolvidas|assistente[&sectorId=]` (caixa de entrada, ADR-006; leitura para Administrador, Atendente e Analista; na fila, Atendente so ve conversas sem setor e as dos seus setores; `assignment` traz `sectorId` e `sectorName`)
- `GET /organizations/:organizationId/inbox/events` (SSE: avisa qual conversa mudou; o painel recarrega pelas rotas normais. Eventos so com ids: `conversation_changed`, `queued` (com `sectorId`), `visitor_message` (com `assignedUserId`) e `transfer` (`byUserId`, `toUserId`, `toSectorId`))
- `GET /organizations/:organizationId/inbox/:conversationId` (mensagens com autor, atribuicao e notas internas)
- `POST .../inbox/:conversationId/transfer` (`{ userId?: uuid|null, sectorId?: uuid|null, reason? }`, ao menos um dos dois; Administrador ou quem esta com a conversa (403 para o resto); 422 se a pessoa nao atende ou o setor nao e da organizacao; o motivo vira nota interna)
- `GET|POST /organizations/:organizationId/inbox-sectors`, `PATCH|DELETE .../inbox-sectors/:sectorId` (`{ name?, memberIds? }`; leitura para Administrador, Atendente e Analista; escrita so Administrador; 409 nome repetido, 422 membro que nao atende)
- `GET|PUT /organizations/:organizationId/inbox-settings` (`{ firstResponseMinutes: 1..10080 | null, emailOnAssignment }`; a resposta traz tambem `emailAvailable`, se a plataforma tem SMTP; leitura para Administrador, Atendente e Analista, escrita so Administrador). Com prazo, cada item da fila ainda sem resposta traz `assignment.firstResponseDueAt` e `firstResponseLate`; `GET .../agent-metrics` traz `team.firstResponseSlaMinutes` e `team.sla: { met, total } | null`
- `GET /organizations/:organizationId/inbox-agents` (quem pode receber conversa: `userId`, `email`, `role`; Administrador e Atendente, para transferir sem precisar da lista de membros)
- `POST .../inbox/:conversationId/assign` (`{ userId | null }`), `POST .../status` (`aberta|pendente|resolvida`), `POST .../messages` (resposta ao visitante; 409 se outra pessoa assumiu), `POST .../notes` (nota interna) — Administrador e Atendente; Master em suporte recebe 403
- `GET|POST /organizations/:organizationId/contacts` (lista paginada com `search`, `tagIds`, `tagMatch`, `optIn`, `segmentId`, `page`; criar: Administrador e Atendente), `GET|PATCH|DELETE .../contacts/:contactId` (detalhe com identidades e conversas; excluir so Administrador e apaga as conversas)
- `POST .../contacts/from-conversation` (salva o visitante da conversa como contato ou liga a um existente; 200 quando juntou, 201 quando criou), `POST .../contacts/import` (`{ csv }`, relatorio por linha), `GET .../contacts/export` (CSV com o mesmo filtro da lista) — importar e exportar so Administrador
- `GET|POST /organizations/:organizationId/contact-tags`, `.../contact-fields`, `.../contact-segments` e `DELETE .../:id` em cada um (ler: Administrador, Atendente e Analista; criar e remover: Administrador)
- `GET /organizations/:organizationId/channels` (Administrador; inclui a URL de webhook e o token de verificacao, nunca o token de acesso), `POST .../channels/{whatsapp|messenger|instagram|telegram}` (confere as credenciais no provedor antes de salvar; 409 se a conta ja esta conectada; no Telegram tambem registra o webhook e, se falhar, salva com estado `erro` e o motivo), `POST .../channels/:id/check`, `DELETE .../channels/:id`
- `GET .../channels/:id/templates` (Administrador e Atendente), `POST .../channels/:id/templates/sync` (Administrador), `POST .../inbox/:conversationId/template` (`{ templateId, params }`, envio de modelo aprovado fora da janela de 24 horas; Administrador e Atendente)
- `POST .../inbox/:conversationId/messages` responde 422 em conversa de WhatsApp fora da janela de 24 horas
- `GET|POST /organizations/:organizationId/automations` (ler: Administrador e Analista; criar: Administrador; regra invalida para o gatilho da 400), `PUT .../automations/:id` (nova versao), `POST .../automations/:id/enabled` (`{ enabled }`), `DELETE .../automations/:id`, `GET .../automations/:id/runs` (ultimas 50 execucoes). Gatilhos: `mensagem_recebida`, `sem_resposta`, `etiqueta_adicionada` (exige a condicao `{ type: "etiqueta_adicionada", tagId }`; acoes `enviar_modelo` `{ connectionId, templateId, params }` e `adicionar_etiqueta`)
- `GET|POST /organizations/:organizationId/campaigns` (ler: Administrador e Analista; criar rascunho: Administrador), `POST .../campaigns/preview` (`{ connectionId, segmentId }` → elegiveis e quantos ficam de fora), `GET .../campaigns/:id` (metricas e destinatarios), `POST .../campaigns/:id/schedule` (`{ at? }`; fixa o publico; 422 se ninguem tem opt-in no canal), `POST .../campaigns/:id/cancel`
- `GET|POST /organizations/:organizationId/canned-responses`, `DELETE .../canned-responses/:responseId` (respostas prontas; criar e remover so Administrador)

Webhooks publicos dos canais (sem sessao; ver `integrations/whatsapp.md` e `integrations/telegram-instagram-messenger.md`):

- `GET /webhooks/{whatsapp|messenger|instagram}/:connectionId` (verificacao da Meta: devolve `hub.challenge` se `hub.verify_token` confere)
- `POST /webhooks/{whatsapp|messenger|instagram|telegram}/:connectionId` (401 sem `X-Hub-Signature-256` valida na Meta ou sem `X-Telegram-Bot-Api-Secret-Token` certo no Telegram; 404 se a conexao nao for daquele provedor; 200 rapido e processamento na fila)

Widget publico (sem sessao; autenticado por chave + origem, ver `embed`):

- `POST /widget/config`
- `POST /widget/conversations` (aceita `externalUserId`, `visitorName`, `visitorEmail`, `context` opcionais, nao assinados, e `identityToken` (JWT HS256 assinado com o segredo da chave). So com token valido a resposta pode vir `200` com `isResumed: true` e o historico; token invalido da 401; com a chave exigindo assinatura, os campos sem token sao ignorados. Ver `docs/integrations/widget-embed.md`)
- `POST /widget/conversations/:conversationId/messages` (com `Accept: text/event-stream`, mesmos eventos `delta`/`done`/`error` do playground; o `done` traz `answer`, `citations` e `humanHandling` e vale mais que os pedacos)
- `POST /widget/conversations/:conversationId/feedback`
- `POST /widget/conversations/:conversationId/handoff` (com a caixa de entrada ligada no assistente, coloca a conversa na fila e retorna `{ inbox: true, status }`; senao, link `wa.me` direto ou lista de setores para o widget mostrar botoes quando ha mais de um configurado)
- `POST /widget/conversations/:conversationId/messages` responde `{ answer: null, humanHandling: true }` enquanto um humano cuida da conversa
- `GET /widget/conversations/:conversationId/events?key=...` (SSE: resposta do atendente e status da conversa; mesma validacao de chave, origem e conversa das outras rotas publicas — a chave publica vai na query porque o `EventSource` nao envia corpo)
