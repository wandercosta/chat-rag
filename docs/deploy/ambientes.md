# Ambientes e deploy

## Local

Docker Compose sobe PostgreSQL com pgvector, Redis e MinIO (ver detalhes e padronização em [`containers.md`](containers.md)). API, worker, painel e widget devem ter configurações separadas por ambiente.

## Ambientes externos

Homologacao e producao possuem banco, bucket, filas, chaves e widget keys distintos. Chaves de teste nunca funcionam em producao.

## Variaveis opcionais da plataforma

- `META_APP_ID`, `META_APP_SECRET`, `META_ES_CONFIG_ID` e `META_WEBHOOK_VERIFY_TOKEN`: cadastro integrado da Meta (WhatsApp) com o app da plataforma. Sem eles, o painel so oferece a conexao manual. A chave secreta do app vai so no `.env`.
- `SMTP_URL`, `SMTP_FROM` e `PANEL_URL`: e-mail de aviso da caixa de entrada. Sem `SMTP_URL`, nenhum e-mail sai e o painel mostra a opcao como indisponivel. A credencial do SMTP vai so no `.env`.

## Publicacao futura

O deploy devera executar migracoes controladas, publicar o bundle do widget em CDN, iniciar workers e validar saude da API/worker. Backup, rollback e rotacao de segredo devem ser documentados antes da primeira producao.

## CI

Testes de isolamento de organizacao e testes de contrato bloqueiam merge/deploy. Avaliacao RAG roda em cadencia mais espacada (agendado ou pre-release), nao em cada PR (ver ADR-002 e `testing/estrategia.md`).

## Fluxo de branches

- `main`: o que esta pronto para publicar. So recebe PR vindo da `develop` (ou correcao urgente), e e o unico destino onde a pipeline roda (`.github/workflows/backend-ci.yml`: push na `main` e PR para a `main`).
- `develop`: integracao do dia a dia. Cada etapa ou funcionalidade sai da `develop` num branch proprio e volta por PR para a `develop`, sem pipeline. Por isso, antes de abrir ou mesclar um PR para a `develop`, rodam-se localmente typecheck, `deps:check` e `test:integration`.
- A pipeline nao roda em cada commit para nao gastar minutos de GitHub Actions; ela roda uma vez, no PR `develop` -> `main`, que e onde o gate do ADR-002 #9 bloqueia o merge.
