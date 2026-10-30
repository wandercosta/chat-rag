# Ambientes e deploy

## Local

Docker Compose sobe PostgreSQL com pgvector, Redis e MinIO (ver detalhes e padronização em [`containers.md`](containers.md)). API, worker, painel e widget devem ter configurações separadas por ambiente.

## Ambientes externos

Homologacao e producao possuem banco, bucket, filas, chaves e widget keys distintos. Chaves de teste nunca funcionam em producao.

## Publicacao futura

O deploy devera executar migracoes controladas, publicar o bundle do widget em CDN, iniciar workers e validar saude da API/worker. Backup, rollback e rotacao de segredo devem ser documentados antes da primeira producao.

## CI

Testes de isolamento de organizacao e testes de contrato bloqueiam merge/deploy. Avaliacao RAG roda em cadencia mais espacada (agendado ou pre-release), nao em cada PR (ver ADR-002 e `testing/estrategia.md`).

## Fluxo de branches

- `main`: o que esta pronto para publicar. So recebe PR vindo da `develop` (ou correcao urgente), e e o unico destino onde a pipeline roda (`.github/workflows/backend-ci.yml`: push na `main` e PR para a `main`).
- `develop`: integracao do dia a dia. Cada etapa ou funcionalidade sai da `develop` num branch proprio e volta por PR para a `develop`, sem pipeline. Por isso, antes de abrir ou mesclar um PR para a `develop`, rodam-se localmente typecheck, `deps:check` e `test:integration`.
- A pipeline nao roda em cada commit para nao gastar minutos de GitHub Actions; ela roda uma vez, no PR `develop` -> `main`, que e onde o gate do ADR-002 #9 bloqueia o merge.
