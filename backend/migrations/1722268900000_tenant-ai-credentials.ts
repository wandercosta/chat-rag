import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("tenant_ai_credentials", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    // 'ambos' representa uma unica credencial reutilizada em teste e producao,
    // sem duplicar o segredo (docs/database/modelo-de-dados.md - Provisionamento).
    environment: { type: "text", notNull: true },
    status: { type: "text", notNull: true },
    masked: { type: "text", notNull: true },
    ciphertext: { type: "bytea", notNull: true },
    iv: { type: "bytea", notNull: true },
    auth_tag: { type: "bytea", notNull: true },
    wrapped_dek: { type: "bytea", notNull: true },
    dek_iv: { type: "bytea", notNull: true },
    dek_auth_tag: { type: "bytea", notNull: true },
    kek_version: { type: "integer", notNull: true, default: 1 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("tenant_ai_credentials", "tenant_ai_credentials_environment_check", {
    check: "environment in ('teste', 'producao', 'ambos')",
  });
  pgm.addConstraint("tenant_ai_credentials", "tenant_ai_credentials_status_check", {
    check: "status in ('valida', 'invalida', 'substituida', 'removida')",
  });
  pgm.addConstraint("tenant_ai_credentials", "tenant_ai_credentials_org_env_unique", {
    unique: ["organization_id", "environment"],
  });
  pgm.createIndex("tenant_ai_credentials", "organization_id");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("tenant_ai_credentials");
}
