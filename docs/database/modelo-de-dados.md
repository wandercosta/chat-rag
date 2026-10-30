# Modelo de dados inicial

Todas as tabelas de dominio multi-tenant devem ter `organization_id` e consultas devem filtralo obrigatoriamente no repositorio/camada de acesso.

## Entidades principais

| Entidade                                              | Responsabilidade                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| organizations                                         | Tenant, status, limites e configuracoes padrao                                                                                                                                                                                                  |
| tenant_ai_credentials                                 | Credencial OpenAI criptografada, ambiente/reuso, metadados mascarados e estado de validacao                                                                                                                                                     |
| ai_model_catalog, tenant_allowed_models               | Catalogo Master de modelos e permissao de escolha por tenant                                                                                                                                                                                    |
| users, memberships                                    | Identidade global e acesso ao painel; papel do tenant e uma coluna em `memberships` (Administrador, Editor de base, Analista ou Atendente — implementacao inicial simplificada, normalizar em tabela `roles` se permissoes granulares exigirem) |
| platform_roles                                        | Papel global de Master, sem herdar acesso de tenant                                                                                                                                                                                             |
| assistants                                            | Comportamento e identidade do chat; `human_inbox_enabled` manda o pedido de atendente do widget para a caixa de entrada em vez do WhatsApp                                                                                                      |
| knowledge_collections, topics, sources, source_chunks | Base e vetores                                                                                                                                                                                                                                  |
| embed_keys, allowed_domains                           | Integracao por ambiente e origem permitida                                                                                                                                                                                                      |
| visitors, conversations, messages                     | Identidade e historico de chat; `messages.role` e visitante, assistente ou atendente, e `author_user_id` guarda quem respondeu                                                                                                                  |
| conversation_assignments                              | Status (aberta, pendente, resolvida) e atribuicao da conversa a um usuario; sem linha, a conversa esta so com o assistente (ADR-006)                                                                                                            |
| conversation_notes, canned_responses                  | Notas internas (nunca enviadas ao visitante) e respostas prontas por organizacao                                                                                                                                                                |
| feedbacks, knowledge_gaps                             | Qualidade e melhoria da base; a lacuna guarda a chave de agrupamento, a pergunta original e um trecho da conversa (ver `workflows/rag-e-conhecimento.md` - Lacunas)                                                                             |
| handoff_configs                                       | Encaminhamento para WhatsApp por organizacao/assistente/setor                                                                                                                                                                                   |
| audit_events, usage_events                            | Seguranca, rastreabilidade e metricas                                                                                                                                                                                                           |
| support_access_sessions                               | Acesso temporario do Master a tenant, com justificativa e expiracao                                                                                                                                                                             |

Todas as entidades acima ja existem em `backend/migrations/` (ver `docs/README.md` - Estado atual para o que cada modulo cobre de fato).

## Entidades planejadas (ADR-006)

Ainda nao existem em `backend/migrations/`. Nomes indicativos; cada uma tem `organization_id` e segue a mesma regra de filtro obrigatorio.

| Entidade                                       | Responsabilidade                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| contacts                                       | Pessoa no CRM da organizacao: nome, dados de contato, opt-in de campanha (origem e data) e opt-out                                      |
| contact_identities                             | Identidade do contato por canal (telefone, id do Instagram, id do Telegram, visitante do widget), unica por organizacao + canal + valor |
| contact_tags, contact_fields, contact_segments | Etiquetas, definicao de campos personalizados e segmentos salvos (filtros) por organizacao                                              |
| channel_connections                            | Canal conectado pelo tenant e token criptografado (envelope encryption), nunca devolvido por API; estado visivel ao Master              |
| channel_templates                              | Templates aprovados sincronizados do provedor (WhatsApp)                                                                                |
| campaigns, campaign_recipients                 | Campanha, publico, agendamento e status de envio por destinatario                                                                       |
| automation_flows, automation_runs              | Fluxo versionado (gatilho, condicoes, acoes) e log de cada execucao                                                                     |

`conversation_assignments`, `conversation_notes` e `canned_responses` ja existem (etapa 2, migration `1722270300000_inbox`); a atribuicao a setor ainda nao.

`visitors` continua existindo: e quem abriu o widget. Quando identificado, o visitante vira uma identidade (`contact_identities`) de um contato. `conversations` ganha o contato; `messages` ja tem o autor e ganha o id da mensagem no provedor, usado para idempotencia do webhook e para o status de entrega.

A politica de retencao passa a cobrir contatos e mensagens de canal. Excluir um contato remove suas identidades e conversas.

## Visitantes e agrupamento

Um visitante pode conter `external_user_id` (unico por `organization_id`, quando presente), `name`, `email` e `context` (jsonb livre). Hoje esses campos chegam sem assinatura, via atributos `data-*` do widget (ver `docs/integrations/widget-embed.md` - Identidade e contexto do visitante); para integracao autenticada, a identidade deveria ser recebida por token assinado pelo backend do sistema hospedeiro — ainda nao implementado. `context` e usado apenas para personalizar o prompt do assistente, nunca como fonte de fatos da base. Cada carregamento do widget cria uma `conversation` nova; quando `external_user_id` se repete, todas apontam para o mesmo `visitor`, permitindo ao painel distinguir e agrupar atendimentos por cliente/id externo em vez de uma massa de sessoes anonimas. Conversas mantem historico limitado e retencao configuravel.

## Vetores

Cada chunk possui texto, embedding, origem, topico, metadados e limites de acesso. O banco deve ter indices convencionais para filtros de tenant/assistente e indice vetorial HNSW por padrao (ver ADR-002).

Particionamento fisico da tabela de chunks por `organization_id` nao entra no MVP, mas fica definido como gatilho documentado: adotar quando um unico tenant ultrapassar uma fracao relevante do volume total de chunks, ou quando o volume total tornar a manutencao do indice mais cara que o aceitavel.

## Provisionamento

Ao criar um tenant, o Master informa identificacao, nome, status inicial, configuracoes padrao e o usuario administrador inicial. A criacao deve ser atomica: nenhum tenant parcialmente criado pode ficar disponivel para widget ou indexacao. A exclusao definitiva nao entra no MVP; suspensao bloqueia painel e widget sem apagar dados — aplicado em `backend/src/tenant-status.ts` (painel) e em `embed/public-access.service.ts` (widget). `GET /organizations/:id` continua liberado mesmo suspenso, para o painel conseguir explicar o motivo em vez de quebrar; as rotas `/master/*` tambem seguem liberadas, senao nao haveria como reativar.

O administrador inicial recebe acesso ao painel do tenant desde o MVP. Pode cadastrar outros usuarios conforme seu papel, mas nao pode criar, suspender ou acessar outro tenant.

O tenant pode criar topicos e fontes antes de configurar IA. Essas fontes permanecem em `aguardando_ativacao`; quando uma chave valida for configurada, o tenant pode iniciar a indexacao das fontes pendentes. Credencial de teste/producao pode ser distinta ou uma unica credencial pode ser referenciada pelos dois ambientes, sem duplicar segredo.
