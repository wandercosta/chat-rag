# ChatRAG — instruções para o Claude Code

A pasta `docs/` é a fonte oficial de verdade do produto (ver [`docs/README.md`](docs/README.md) para o índice completo e o estado atual da Fase 0). Raiz do repo = painel (TanStack Start/React/TypeScript, gerado no Lovable). `backend/` = API (Fastify/TypeScript, ver `backend/README.md`). `docker-compose.yml` = stack completa com seed (Postgres+pgvector, Redis, storage S3/SeaweedFS, API, worker, painel); `docker-compose.infra.yml` = só a infraestrutura, para desenvolver com hot reload. Provedor de IA da plataforma por `.env` (ADR-005). Rumo do produto: atendimento omnichannel com CRM de contatos (ADR-006, Fase 3 do roadmap em etapas).

## Regra permanente: documentação acompanha toda mudança

Sempre que uma alteração (implementada ou apenas decidida em conversa) tocar em arquitetura, contratos de API, modelo de dados, segurança/privacidade, fluxo de RAG, widget, painel ou operação:

1. Leia primeiro os documentos relevantes em `docs/` antes de propor ou implementar qualquer coisa.
2. Verifique se a mudança contradiz alguma decisão registrada em `docs/decisions/ADR-*.md`. Se contradizer, isso exige um novo ADR (não editar o antigo silenciosamente) explicando a mudança de decisão.
3. Atualize o(s) documento(s) afetado(s) **na mesma entrega**, nunca depois. Nunca deixe uma alteração de regra, contrato ou comportamento sem refletir na doc correspondente.
4. Se a mudança introduzir uma nova entidade, papel, endpoint ou fluxo, atualize também `docs/database/modelo-de-dados.md` e/ou `docs/apis/contratos-planejados.md` conforme o caso.
5. Rode mentalmente (ou literalmente, quando já houver testes) o checklist em [`docs/checklists/antes-de-implementar.md`](docs/checklists/antes-de-implementar.md) antes de considerar qualquer tarefa de implementação concluída.
6. Nunca registre segredos, chaves ou tokens em nenhum documento, log ou exemplo.

Isso vale tanto para código quanto para decisões de arquitetura discutidas apenas em chat — se o usuário aprovar uma mudança de rumo, ela deve virar texto em `docs/` antes de a tarefa ser considerada concluída.

## Convenções de estrutura de código (ADR-002)

- Cada módulo de backend expõe só a interface pública do seu serviço; nenhum módulo lê repositório/tabela/tipo interno de outro módulo — a checagem deve ser automatizada por lint de dependências, não apenas revisão manual.
- Nenhum arquivo de código deve passar de ~300 linhas. Ao se aproximar do limite, divida por sub-responsabilidade (ex.: `sources.repository.ts` e `topics.repository.ts` em vez de um `knowledge.repository.ts` monolítico) em vez de deixar crescer um arquivo concentrando tudo do módulo.
- Ao criar um módulo novo, já organize em subpastas por responsabilidade (rotas, serviço, repositório, tipos) em vez de um único arquivo.

## Princípios arquiteturais que não podem ser violados sem novo ADR

- Isolamento por organização (`organization_id`) é fronteira de segurança, não filtro visual.
- Resposta do assistente é ancorada na base por padrão (sem conhecimento geral, salvo config futura).
- Produto independente: login, dados e deploy próprios.
- Comportamento por cliente/assistente é configuração, não fork de código.
- Master (control plane) e Tenant (painel) são escopos de administração distintos e não podem se misturar.
- Chave OpenAI do tenant (BYOK) nunca é devolvida por API/log/auditoria; chaves da plataforma ficam só no `.env` (ADR-005). O mesmo vale para tokens de canal (ADR-006).
- Ação externa permitida é só comunicação pelos canais que o tenant conectou, com responsável humano e auditoria; o assistente não decide ações nem lê ou altera dados de sistemas do cliente (ADR-006).

## Estado atual do projeto

Implementação adiantada em relação à ordem estrita do roadmap (`docs/planning/escopo-mvp-e-roadmap.md`): o backend cobre identity, organizations (+ BYOK com envelope encryption), assistants, knowledge, rag, worker de indexação, conversations, embed, analytics, WhatsApp (handoff por setor) e sessão de suporte do Master. O painel está quase todo ligado à API real — telas reais: login, visão geral, tenants, assistentes (lista/criação/edição), base de conhecimento, playground, conversas, lacunas, integrações/widget-keys, configurações e auditoria. Caixa de entrada do widget (ADR-006, etapa 2: módulo `inbox`, papel Atendente, tela `/atendimento`, tempo real por SSE + Redis) também é real. Usuários do tenant, coleções (escopo de conhecimento do assistente) e as telas de Master (plataforma e detalhe do tenant, com acesso de suporte justificado) também são reais — `src/lib/mock-data.ts` foi removido e nenhuma tela usa dado fictício. Falta: rota de consumo agregado cruzando tenants para a visão geral da plataforma. Antes de assumir que algo não existe, verifique `docs/README.md` (seção "Estado atual") e o código — não assuma pré-implementação por padrão.
