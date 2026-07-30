# DOCUMENTACAO CENTRAL DO PROJETO

Esta pasta e a fonte oficial de verdade do ChatRAG. O produto e as decisoes estruturais aqui registradas ja tem uma primeira implementacao em andamento (ver "Estado atual" abaixo) — qualquer mudanca de rumo continua exigindo atualizar esta documentacao na mesma entrega.

## Leitura obrigatoria

Antes de qualquer implementacao, leia os documentos relevantes desta pasta. Alteracoes de arquitetura, contratos, seguranca ou fluxo devem atualizar esta documentacao na mesma entrega.

## Indice

- `architecture/visao-geral.md` - limites, componentes e principios arquiteturais.
- `planning/escopo-mvp-e-roadmap.md` - escopo e ordem de evolucao.
- `backend/especificacao-backend.md` - modulos, responsabilidades e processamento.
- `frontend/painel-administrativo.md` - especificacao do painel que sera desenhado no Lovable.
- `frontend/prompt-lovable.md` - prompt pronto para gerar o protótipo do painel no Lovable.
- `integrations/widget-embed.md` - contrato do widget instalavel em sites externos.
- `workflows/rag-e-conhecimento.md` - ciclo de vida das fontes e respostas.
- `database/modelo-de-dados.md` - entidades e regras de isolamento.
- `security/privacidade-e-acesso.md` - chaves, permissoes e privacidade.
- `apis/contratos-planejados.md` - limites iniciais da API, sem congelar payloads.
- `decisions/ADR-001-fundacoes-do-produto.md` - decisoes ja aprovadas.
- `decisions/ADR-002-seguranca-estrutura-e-limites.md` - seguranca de segredos, fronteiras de modulo, limites de escala e operacao.
- `checklists/antes-de-implementar.md` - validacoes obrigatorias.

## Estado atual

Implementacao adiantada em relacao a ordem estrita do roadmap (`planning/escopo-mvp-e-roadmap.md`): ja cobre pedacos de Fase 0, 1 e 2, mas nenhuma fase esta "fechada" — o que falta em cada uma esta listado abaixo.

- Painel administrativo prototipado no Lovable (raiz do repo, TanStack Start/React/TypeScript), com dados mockados em `src/lib/mock-data.ts` e simulador de sessao Master/Tenant em `src/lib/session.tsx`. Cada TODO(API) no codigo marca onde a chamada real ao backend entra — o painel ainda nao foi ligado ao backend abaixo.
- `docker-compose.yml` (raiz) sobe Postgres+pgvector, Redis e MinIO localmente.
- `backend/` (Fastify/TypeScript, ver `backend/README.md`) implementa:
  - `identity`: login/sessao via Redis, hooks de autorizacao (`requireSession`, `requireMaster`, `requireOrgRole`).
  - `organizations`: provisionamento atomico de tenant pelo Master, suspensao/reativacao, credencial OpenAI por tenant com envelope encryption real (BYOK, ADR-002 #1).
  - `assistants`: CRUD de assistentes e catalogo de modelos (Master) + modelos liberados por tenant.
  - `knowledge`: colecoes, topicos, fontes (texto/URL/PDF/DOCX) com a maquina de estados completa, extracao (`pdf-parse`/`mammoth`/fetch+strip-html) e chunking.
  - `rag`: interface de provedor de IA (adapter OpenAI), recuperacao vetorial (pgvector HNSW) escopada por assistente, politica de resposta estrita com criacao de lacuna, chat de playground.
  - worker de indexacao (`backend/src/worker.ts`, fila BullMQ/Redis) com limite de concorrencia por tenant (ADR-002 #4).
  - `conversations`: conversas/mensagens/feedback/lacunas.
  - `embed`: chaves de widget (hash, nunca texto puro em repouso), dominios permitidos, rate limit padrao (ADR-002 #5) e rotas publicas do widget (config/conversa/mensagem/feedback).
  - `audit`: eventos append-only.
  - Testes: unitarios (sem infra) + integracao (`RUN_INTEGRATION_TESTS=1`, requer Docker); CI em `.github/workflows/backend-ci.yml`.
- **Ainda nao implementado** (documentado, nao esquecido): `analytics` continua stub (agregados de uso/custo, `usage_events`); `handoff_configs`/encaminhamento WhatsApp; `support_access_sessions` (sessao de suporte do Master com justificativa/expiracao — hoje o Master so tem checagem de papel, sem esse fluxo); tabela `roles` normalizada (papel de tenant hoje e uma coluna simples em `memberships`); bundle JS publico do widget (so a API existe); revisao de fonte configuravel por assistente especifico (hoje e por colecao); streaming de resposta (hoje request/response simples, dentro do que os contratos ja permitem — "streaming ou polling curto"); integracao do painel Lovable com esta API.
- Desenvolvimento desacoplado do PAIM; integracao com ele sera opcional e posterior.
