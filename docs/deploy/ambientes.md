# Ambientes e deploy

## Local

Docker Compose sobe PostgreSQL com pgvector, Redis e MinIO. API, worker, painel e widget devem ter configuracoes separadas por ambiente.

## Ambientes externos

Homologacao e producao possuem banco, bucket, filas, chaves e widget keys distintos. Chaves de teste nunca funcionam em producao.

## Publicacao futura

O deploy devera executar migracoes controladas, publicar o bundle do widget em CDN, iniciar workers e validar saude da API/worker. Backup, rollback e rotacao de segredo devem ser documentados antes da primeira producao.

## CI

Testes de isolamento de organizacao e testes de contrato bloqueiam merge/deploy. Avaliacao RAG roda em cadencia mais espacada (agendado ou pre-release), nao em cada PR (ver ADR-002 e `testing/estrategia.md`).
