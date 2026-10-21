#!/bin/sh
# =============================================================================
# entrypoint.sh — inicializacao do container da API
#
#   1. Migrations do banco (idempotente)
#   2. Bucket do MinIO (idempotente)
#   3. Usuario Master (idempotente)
#   4. Processo informado no CMD
#
# O worker e o seed usam a mesma imagem com outro entrypoint (ver
# docker-compose.yml) e nao passam por aqui.
# =============================================================================
set -e

: "${MASTER_EMAIL:?defina MASTER_EMAIL no .env}"
: "${MASTER_PASSWORD:?defina MASTER_PASSWORD no .env}"

echo "▶ Migrations"
npx node-pg-migrate up --migrations-dir migrations --database-url-var DATABASE_URL --tsx

echo "▶ Bucket de arquivos"
node dist/bootstrap/create-bucket.js

echo "▶ Usuario Master"
node dist/bootstrap/create-master.js "$MASTER_EMAIL" "$MASTER_PASSWORD"

echo "✓ Inicializacao concluida"
exec "$@"
