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

## Planejado pelo ADR-006 (ainda sem rotas)

- Painel: campanhas e automacoes.

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

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET|POST /master/tenants`, `POST /master/tenants/:organizationId/status`
- `GET|POST /master/tenants/:organizationId/support-sessions`, `POST .../support-sessions/:sessionId/end` (justificativa + expiracao, auditado — ADR-001 #14)
- `GET /organizations/:organizationId` (auto-atendimento do tenant: nome/status da propria organizacao)
- `PUT /organizations/:organizationId/retention` (politica de retencao da organizacao)
- `GET|POST /organizations/:organizationId/ai-credentials`, `DELETE .../ai-credentials/:environment`
- `GET /master/tenants/:organizationId/ai-credentials`, `DELETE .../ai-credentials/:environment` (suporte Master, so estado, exige sessao de suporte ativa)
- `GET|POST|PATCH /organizations/:organizationId/assistants[/:assistantId]`
- `GET|POST|PATCH /master/model-catalog[/:modelId]`, `GET|PUT /master/tenants/:organizationId/allowed-models`, `GET /organizations/:organizationId/allowed-models`
- `GET|POST|DELETE /organizations/:organizationId/assistants/:assistantId/handoff-configs[/:configId]` (setores de WhatsApp)
- `GET|POST /organizations/:organizationId/collections`, `GET|PUT|DELETE .../assistants/:assistantId/collections[/:collectionId]` (escopo de conhecimento do assistente — ver ADR-003)
- `GET|POST /organizations/:organizationId/topics`, `PATCH .../topics/:topicId` (inclusive mover o topico entre colecoes)
- `GET /organizations/:organizationId/topics/:topicId/sources`, `POST .../sources`, `POST .../sources/upload` (multipart), `POST .../sources/:sourceId/{approve,reindex,archive}`, `POST .../sources/activate-pending` (destrava fontes presas em `aguardando_ativacao` apos uma chave de IA valida existir)
- `POST /organizations/:organizationId/assistants/:assistantId/playground-messages`
- `GET /organizations/:organizationId/conversations[/:conversationId]`, `POST .../feedback`
- `GET /organizations/:organizationId/gaps`, `POST .../gaps/:gapId/resolve`, `POST .../gaps/:gapId/answer` (responder a lacuna cria uma fonte de texto no topico indicado — mesmo pipeline de qualquer outra fonte — e marca a lacuna como resolvida; papeis Administrador/Editor de base)
- `GET|POST /organizations/:organizationId/widget-keys`, `POST .../revoke`, `POST|DELETE .../domains[/:domainId]`
- `GET|POST /organizations/:organizationId/members`, `PATCH|DELETE .../members/:membershipId` (acessos do tenant; senha provisoria definida pelo administrador, sem cadastro publico; a organizacao nunca fica sem administrador)
- `GET /organizations/:organizationId/audit`
- `GET /organizations/:organizationId/usage` (resumo agregado — ver limitacoes em `docs/README.md`)
- `GET /organizations/:organizationId/inbox?view=fila|minhas|abertas|resolvidas|assistente` (caixa de entrada, ADR-006; leitura para Administrador, Atendente e Analista)
- `GET /organizations/:organizationId/inbox/events` (SSE: avisa qual conversa mudou; o painel recarrega pelas rotas normais)
- `GET /organizations/:organizationId/inbox/:conversationId` (mensagens com autor, atribuicao e notas internas)
- `POST .../inbox/:conversationId/assign` (`{ userId | null }`), `POST .../status` (`aberta|pendente|resolvida`), `POST .../messages` (resposta ao visitante; 409 se outra pessoa assumiu), `POST .../notes` (nota interna) — Administrador e Atendente; Master em suporte recebe 403
- `GET|POST /organizations/:organizationId/contacts` (lista paginada com `search`, `tagIds`, `tagMatch`, `optIn`, `segmentId`, `page`; criar: Administrador e Atendente), `GET|PATCH|DELETE .../contacts/:contactId` (detalhe com identidades e conversas; excluir so Administrador e apaga as conversas)
- `POST .../contacts/from-conversation` (salva o visitante da conversa como contato ou liga a um existente; 200 quando juntou, 201 quando criou), `POST .../contacts/import` (`{ csv }`, relatorio por linha), `GET .../contacts/export` (CSV com o mesmo filtro da lista) — importar e exportar so Administrador
- `GET|POST /organizations/:organizationId/contact-tags`, `.../contact-fields`, `.../contact-segments` e `DELETE .../:id` em cada um (ler: Administrador, Atendente e Analista; criar e remover: Administrador)
- `GET /organizations/:organizationId/channels` (Administrador; inclui a URL de webhook e o token de verificacao, nunca o token de acesso), `POST .../channels/{whatsapp|messenger|instagram|telegram}` (confere as credenciais no provedor antes de salvar; 409 se a conta ja esta conectada; no Telegram tambem registra o webhook e, se falhar, salva com estado `erro` e o motivo), `POST .../channels/:id/check`, `DELETE .../channels/:id`
- `GET .../channels/:id/templates` (Administrador e Atendente), `POST .../channels/:id/templates/sync` (Administrador), `POST .../inbox/:conversationId/template` (`{ templateId, params }`, envio de modelo aprovado fora da janela de 24 horas; Administrador e Atendente)
- `POST .../inbox/:conversationId/messages` responde 422 em conversa de WhatsApp fora da janela de 24 horas
- `GET|POST /organizations/:organizationId/canned-responses`, `DELETE .../canned-responses/:responseId` (respostas prontas; criar e remover so Administrador)

Webhooks publicos dos canais (sem sessao; ver `integrations/whatsapp.md` e `integrations/telegram-instagram-messenger.md`):

- `GET /webhooks/{whatsapp|messenger|instagram}/:connectionId` (verificacao da Meta: devolve `hub.challenge` se `hub.verify_token` confere)
- `POST /webhooks/{whatsapp|messenger|instagram|telegram}/:connectionId` (401 sem `X-Hub-Signature-256` valida na Meta ou sem `X-Telegram-Bot-Api-Secret-Token` certo no Telegram; 404 se a conexao nao for daquele provedor; 200 rapido e processamento na fila)

Widget publico (sem sessao; autenticado por chave + origem, ver `embed`):

- `POST /widget/config`
- `POST /widget/conversations` (aceita `externalUserId`, `visitorName`, `visitorEmail`, `context` opcionais — identidade/contexto do visitante nao assinados, ver `docs/integrations/widget-embed.md`)
- `POST /widget/conversations/:conversationId/messages`
- `POST /widget/conversations/:conversationId/feedback`
- `POST /widget/conversations/:conversationId/handoff` (com a caixa de entrada ligada no assistente, coloca a conversa na fila e retorna `{ inbox: true, status }`; senao, link `wa.me` direto ou lista de setores para o widget mostrar botoes quando ha mais de um configurado)
- `POST /widget/conversations/:conversationId/messages` responde `{ answer: null, humanHandling: true }` enquanto um humano cuida da conversa
- `GET /widget/conversations/:conversationId/events?key=...` (SSE: resposta do atendente e status da conversa; mesma validacao de chave, origem e conversa das outras rotas publicas — a chave publica vai na query porque o `EventSource` nao envia corpo)
