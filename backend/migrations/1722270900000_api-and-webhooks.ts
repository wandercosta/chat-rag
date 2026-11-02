import type { MigrationBuilder } from "node-pg-migrate";

/**
 * API publica e webhooks de saida (ADR-006, etapa 8).
 *
 * - api_tokens: token por organizacao, guardado so em hash (sha256), com
 *   escopos e revogacao. O texto do token aparece uma unica vez, ao criar.
 * - webhook_endpoints: URL https do cliente, eventos assinados e o segredo de
 *   assinatura (envelope cifrado: precisa voltar a texto para assinar).
 * - webhook_deliveries: cada entrega, com tentativas e o ultimo resultado,
 *   para o cliente conferir no painel.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("api_tokens", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    name: { type: "text", notNull: true },
    token_prefix: { type: "text", notNull: true },
    token_hash: { type: "text", notNull: true, unique: true },
    scopes: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    last_used_at: { type: "timestamptz" },
    revoked_at: { type: "timestamptz" },
  });
  pgm.createIndex("api_tokens", ["organization_id", "created_at"]);

  pgm.createTable("webhook_endpoints", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    url: { type: "text", notNull: true },
    events: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    secret: { type: "jsonb", notNull: true },
    enabled: { type: "boolean", notNull: true, default: true },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("webhook_endpoints", ["organization_id", "enabled"]);

  pgm.createTable("webhook_deliveries", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    endpoint_id: {
      type: "uuid",
      notNull: true,
      references: "webhook_endpoints",
      onDelete: "cascade",
    },
    event: { type: "text", notNull: true },
    payload: { type: "jsonb", notNull: true },
    status: { type: "text", notNull: true, default: "pendente" },
    attempts: { type: "integer", notNull: true, default: 0 },
    last_status_code: { type: "integer" },
    last_error: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    delivered_at: { type: "timestamptz" },
  });
  pgm.addConstraint("webhook_deliveries", "webhook_deliveries_status_check", {
    check: "status in ('pendente', 'entregue', 'falhou')",
  });
  pgm.createIndex("webhook_deliveries", ["endpoint_id", "created_at"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("webhook_deliveries");
  pgm.dropTable("webhook_endpoints");
  pgm.dropTable("api_tokens");
}
