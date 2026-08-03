#!/bin/sh
# =============================================================================
# entrypoint.sh — Inicializacao automatica do ChatRAG
#
# Roda antes de subir a API:
#   1. Executa as migrações (idempotente — pula o que já rodou)
#   2. Cria o bucket no MinIO (idempotente — ignora se já existe)
#   3. Cria o usuário Master (idempotente — ignora se já existe)
#   4. Inicia o processo informado via CMD
#
# Variaveis configuradas via docker-compose (têm defaults):
#   MASTER_EMAIL    — email do usuario master (default: admin@chatrag.local)
#   MASTER_PASSWORD — senha do usuario master (default: Admin@2025!)
# =============================================================================
set -e

MASTER_EMAIL="${MASTER_EMAIL:-admin@chatrag.local}"
MASTER_PASSWORD="${MASTER_PASSWORD:-Admin@2025!}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        ChatRAG — Inicializando...        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ---------------------------------------------------------------------------
# 1. Migrações (node-pg-migrate — idempotente, pula o que já rodou)
# ---------------------------------------------------------------------------
echo "▶ Executando migrações do banco de dados..."
node node_modules/node-pg-migrate/bin/node-pg-migrate.js up \
  --migrations-dir migrations \
  --database-url-var DATABASE_URL \
  --no-lock 2>&1 | sed 's/^/  /'
echo "✓ Migrações concluídas."
echo ""

# ---------------------------------------------------------------------------
# 2. Bucket do MinIO (idempotente via script compilado)
# ---------------------------------------------------------------------------
echo "▶ Criando bucket de arquivos no MinIO..."
node dist/scripts/create-bucket.js 2>&1 | sed 's/^/  /' || \
  echo "  (bucket já existe ou MinIO não disponível — continuando)"
echo "✓ Bucket pronto."
echo ""

# ---------------------------------------------------------------------------
# 3. Usuário Master (ignora erro de email duplicado = já existe)
# ---------------------------------------------------------------------------
echo "▶ Verificando usuário Master ($MASTER_EMAIL)..."
node dist/scripts/create-master.js "$MASTER_EMAIL" "$MASTER_PASSWORD" 2>&1 | sed 's/^/  /' || \
  echo "  (usuário já existe — ignorando)"
echo "✓ Usuário Master pronto."
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Inicialização concluída! Iniciando app..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ---------------------------------------------------------------------------
# 4. Inicia o processo principal (API ou Worker)
# ---------------------------------------------------------------------------
exec "$@"
