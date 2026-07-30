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
- `GET|POST /organizations/:organizationId/collections`, `PUT|DELETE .../assistants/:assistantId/collections/:collectionId`
- `GET|POST /organizations/:organizationId/topics`
- `GET /organizations/:organizationId/topics/:topicId/sources`, `POST .../sources`, `POST .../sources/upload` (multipart), `POST .../sources/:sourceId/{approve,reindex,archive}`
- `POST /organizations/:organizationId/assistants/:assistantId/playground-messages`
- `GET /organizations/:organizationId/conversations[/:conversationId]`, `POST .../feedback`
- `GET /organizations/:organizationId/gaps`, `POST .../gaps/:gapId/resolve`
- `GET|POST /organizations/:organizationId/widget-keys`, `POST .../revoke`, `POST|DELETE .../domains[/:domainId]`
- `GET /organizations/:organizationId/audit`
- `GET /organizations/:organizationId/usage` (resumo agregado — ver limitacoes em `docs/README.md`)

Widget publico (sem sessao; autenticado por chave + origem, ver `embed`):

- `POST /widget/config`
- `POST /widget/conversations`
- `POST /widget/conversations/:conversationId/messages`
- `POST /widget/conversations/:conversationId/feedback`
- `POST /widget/conversations/:conversationId/handoff` (retorna link `wa.me` direto, ou lista de setores para o widget mostrar botoes quando ha mais de um configurado)
