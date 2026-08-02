import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("embed_keys", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    assistant_id: { type: "uuid", notNull: true, references: "assistants", onDelete: "cascade" },
    environment: { type: "text", notNull: true },
    key_hash: { type: "text", notNull: true, unique: true },
    masked: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "ativa" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    revoked_at: { type: "timestamptz" },
  });
  pgm.addConstraint("embed_keys", "embed_keys_environment_check", {
    check: "environment in ('teste', 'producao')",
  });
  pgm.addConstraint("embed_keys", "embed_keys_status_check", {
    check: "status in ('ativa', 'revogada')",
  });
  pgm.createIndex("embed_keys", "organization_id");

  pgm.createTable("allowed_domains", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    embed_key_id: { type: "uuid", notNull: true, references: "embed_keys", onDelete: "cascade" },
    domain: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("allowed_domains", "allowed_domains_unique", {
    unique: ["embed_key_id", "domain"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("allowed_domains");
  pgm.dropTable("embed_keys");
}
