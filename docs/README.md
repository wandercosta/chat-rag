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
- `decisions/ADR-003-colecao-como-filtro-opcional.md` - colecao restringe o que o assistente enxerga da base, mas nao e pre-requisito para responder.
- `checklists/antes-de-implementar.md` - validacoes obrigatorias.

## Estado atual

Implementacao adiantada em relacao a ordem estrita do roadmap (`planning/escopo-mvp-e-roadmap.md`): ja cobre pedacos de Fase 0, 1 e 2, mas nenhuma fase esta "fechada" — o que falta em cada uma esta listado abaixo.

- Painel administrativo prototipado no Lovable (raiz do repo, TanStack Start/React/TypeScript). Parcialmente ligado ao backend real:
  - Real: login/logout/sessao (`src/lib/session.tsx` consulta `GET /auth/me`, sem simulador de perfil), CORS dedicado (`backend/src/cors.ts` — painel com origem restrita + cookie, widget publico com origem aberta e sem cookie), tenants do Master (`/tenants`), assistentes (`/assistentes`, lista + criacao + edicao real de nome/modelo/status/instrucoes/retencao), lacunas (`/lacunas`, inclusive responder uma lacuna criando fonte), configuracoes (`/configuracoes`: chave OpenAI BYOK de verdade — cadastro/estado/remocao, modelos liberados, retencao da organizacao), base de conhecimento (`/conhecimento`: topicos, fontes texto/URL/upload PDF-DOCX, aprovar/reindexar/arquivar) e playground (`/playground`, chama `POST .../playground-messages` de verdade). Verificado no browser contra o backend rodando, nao so por inspecao de codigo.
  - Real tambem: visao geral do tenant (`/`, contadores e listas vindos da API), conversas (`/conversas`, lista + transcricao real), integracoes (`/integracoes`, criacao/listagem/revogacao de chave de widget com o script de instalacao gerado a partir da chave real — o texto puro so aparece na criacao) e auditoria (`/auditoria`, trilha real + resumo de uso do modulo analytics).
  - Ainda mockado (`src/lib/mock-data.ts`, TODO(API) marca onde entra a chamada real): visao geral da plataforma (Master) e detalhe do tenant (Master) com sessao de suporte — o backend dessas ja existe, so a tela nao foi trocada.
  - `/usuarios` **nao tem backend**: o modulo identity so expoe login/logout/me, sem rotas de listagem de usuarios do tenant nem de convite. A tela agora diz isso explicitamente em vez de exibir quatro usuarios ficticios e um "convite enviado (simulado)". Criar essas rotas e o proximo passo para a tela existir de verdade.
  - O estado de "chave de IA configurada" deixou de ser um booleano simulado no `session.tsx`: `ActivationBanner` consulta `GET /organizations/:id/ai-credentials` de verdade.
  - Link "Detalhes" para a pagina de detalhe de tenant (Master) segue removido da lista real: essa pagina ainda espera um id do mock e quebraria (404) com um id real. O detalhe do assistente ja e real e esta linkado.
- `docker-compose.yml` (raiz) sobe Postgres+pgvector, Redis e MinIO localmente.
- `backend/` (Fastify/TypeScript, ver `backend/README.md`) implementa:
  - `identity`: login/sessao via Redis, hooks de autorizacao (`requireSession`, `requireMaster`, `requireOrgRole`, `requireMasterSupportSession`). Master so acessa dados operacionais de um tenant com uma sessao de suporte ativa para aquela organizacao (`support_access_sessions`: justificativa, expiracao, auditoria — ADR-001 #14).
  - `organizations`: provisionamento atomico de tenant pelo Master, suspensao/reativacao, credencial OpenAI por tenant com envelope encryption real (BYOK, ADR-002 #1), politica de retencao por organizacao.
  - `assistants`: CRUD de assistentes e catalogo de modelos (Master) + modelos liberados por tenant; setores de encaminhamento WhatsApp (`handoff_configs`) por assistente.
  - `knowledge`: colecoes, topicos, fontes (texto/URL/PDF/DOCX) com a maquina de estados completa, extracao (`pdf-parse`/`mammoth`/fetch+strip-html) e chunking.
  - `rag`: interface de provedor de IA (adapter OpenAI), recuperacao vetorial (pgvector HNSW) escopada por assistente, politica de resposta estrita com criacao de lacuna, chat de playground.
  - worker de indexacao e retencao (`backend/src/worker.ts`, filas BullMQ/Redis): indexacao com limite de concorrencia por tenant (ADR-002 #4); expurgo diario de conversas alem da politica efetiva (assistente > organizacao > padrao de 90 dias — ADR-002 #6).
  - `conversations`: conversas/mensagens/feedback/lacunas.
  - `embed`: chaves de widget (hash, nunca texto puro em repouso), dominios permitidos, rate limit padrao (ADR-002 #5), rotas publicas do widget (config/conversa/mensagem/feedback) e encaminhamento WhatsApp (link `wa.me` com so a ultima pergunta, selecao de setor quando ha mais de um).
  - `audit`: eventos append-only.
  - `analytics`: `usage_events` (latencia/modelo do RAG, sem contexto, resultado de indexacao, widget carregado/limitado) e resumo agregado por organizacao. Nao inclui custo estimado ainda (sem tabela de precos por modelo decidida) nem conversas/mensagens/fontes-com-erro no resumo.
  - Testes: unitarios (sem infra) + integracao (`RUN_INTEGRATION_TESTS=1`, requer Docker); CI em `.github/workflows/backend-ci.yml`. Testes de integracao rodam com `fileParallelism: false` (varios arquivos compartilham o mesmo Postgres e fazem DELETE global no `beforeEach`; em paralelo isso e uma corrida real, nao teorica — foi pego rodando a suite de verdade) e contra um banco `chatrag_test` isolado do de dev (`vitest.config.ts` sobrescreve `DATABASE_URL`; `resetDatabase()` tambem se recusa a rodar fora de um banco com "test" no nome) — antes disso, um `test:integration` local ja apagou um tenant de demo inteiro do banco de dev (ver `backend/README.md` - Testes).
  - Validado ponta a ponta contra Postgres/Redis/MinIO reais (nao so typecheck/lint/testes): migrations rodam limpas, login/sessao via Redis, criacao atomica de tenant, isolamento entre organizacoes (tenant B nao enxerga nada do tenant A) e o fluxo completo de sessao de suporte do Master (bloqueado sem sessao ativa, liberado e auditado com uma). Dois bugs reais so apareceram nessa validacao — nenhum teste unitario ou de integracao anterior pegava: (1) a extensao `citext` era criada depois da tabela que ja a usava; (2) `request.auth` so era preenchido para rotas do proprio modulo identity — todo guard de outro modulo falhava sempre, porque o hook de sessao ficava preso ao encapsulamento do plugin do Fastify (corrigido com `fastify-plugin`; ha agora um teste HTTP real de regressao em `backend/src/app.integration.test.ts`).
- `widget/` (ver `widget/README.md`): bundle JS publico standalone (~12kB, sem dependencias), Shadow DOM, modo flutuante/embutido, config/conversa/mensagem/feedback/handoff. Testado manualmente com `fetch` mockado (`widget/test/manual-test.html`), sem precisar do backend rodando. Titulo/tema/posicao vem de atributos `data-*` do `<script>`, ainda nao de configuracao do assistente na API.
- **Ainda nao implementado** (documentado, nao esquecido): tabela `roles` normalizada (papel de tenant hoje e uma coluna simples em `memberships`); revisao de fonte configuravel por assistente especifico (hoje e por colecao); streaming de resposta (hoje request/response simples, dentro do que os contratos ja permitem — "streaming ou polling curto"); anonimizacao como alternativa a exclusao na retencao (hoje so exclui); custo estimado por modelo no resumo de uso; hierarquia de configuracao visual do widget (assistente > organizacao) buscada da API; token de identidade autenticada no widget; a maior parte das telas do painel (ver acima).
- Desenvolvimento desacoplado do PAIM; integracao com ele sera opcional e posterior.
