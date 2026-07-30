# Visao geral da arquitetura

## Objetivo

O ChatRAG fornece assistentes de IA baseados em conhecimento privado. Cada assistente atende um contexto definido, pode ser testado no painel e integrado a qualquer site por um script, sem alterar o sistema hospedeiro.

## Principios obrigatorios

1. **Isolamento por organizacao**: dados nunca atravessam o limite do tenant.
2. **Resposta ancorada**: por padrao, o assistente responde somente com conhecimento recuperado da base.
3. **Desacoplamento do PAIM**: o produto possui login, dados e deploy proprios; PAIM e apenas uma futura integracao.
4. **Configuracao, nao bifurcacao**: comportamento por cliente/assistente deve ser configuravel no painel.
5. **Processamento assincrono**: upload e indexacao nao bloqueiam o painel.
6. **Evolucao SaaS**: cobranca nao entra no MVP, mas tenant, uso, limites e auditoria nascem prontos para isso.
7. **Control plane separado**: o painel Master provisiona e governa tenants; o painel de tenant esta disponivel no MVP e enxerga somente o proprio contexto.

## Modelo multi-tenant inicial

O produto nasce com dois escopos de administracao:

- **Master (plataforma):** cria, ativa, suspende e configura tenants; cria o usuario administrador inicial, acompanha uso global e executa suporte/auditoria.
- **Tenant (organizacao):** administra desde o MVP apenas seus usuarios, assistentes, conhecimento, widget, conversas e configuracoes permitidas.

O provisionamento de tenant nao depende de fluxo comercial nem de auto cadastro no MVP. O Master cria o tenant e o primeiro usuario por convite/definicao de senha controlada. Nao existe cadastro publico de tenant ou de usuario.

## Componentes previstos

```text
Painel React -----------\
Widget JS em site ------- API TypeScript ---- PostgreSQL + pgvector
                            |        |---- Redis/fila
                            |        |---- armazenamento S3 compativel
                            |        |---- OpenAI (modelo e embeddings)
                            |---- worker de extracao e indexacao
```

## Stack aprovada

- Painel: React e TypeScript. O primeiro desenho visual sera produzido no Lovable.
- API e workers: Node.js e TypeScript, em monolito modular.
- Widget: JavaScript/TypeScript distribuido como bundle leve e independente da stack do site hospedeiro.
- Dados: PostgreSQL com extensao `pgvector`.
- Fila/cache: Redis.
- Arquivos: armazenamento compativel com S3; no desenvolvimento local, MinIO via Docker.
- IA inicial: OpenAI, atras de uma interface de provedor.
- Credenciais de IA: chave OpenAI configurada por tenant (BYOK), criptografada e usada exclusivamente no servidor. O tenant pode preparar sua base sem chave, mas indexacao e chat exigem uma chave valida.
- Modelos: o Master mantem uma lista curta de modelos aprovados; cada tenant escolhe somente entre os modelos liberados para ele.
- Ambiente local: Docker Compose para PostgreSQL, Redis e MinIO.

## Limites do MVP

O produto responde perguntas e encaminha ao atendimento. Ele nao executa acoes em sistemas externos, nao consulta bancos do cliente e nao modifica dados externos.
