import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Classificacao de leads com IA (ADR-009): ligada por organizacao
 * (lead_settings, desligada por padrao) e sugestoes por contato
 * (lead_insights) que alguem aceita ou descarta. Sai junto com o contato.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("lead_settings", {
    organization_id: {
      type: "uuid",
      primaryKey: true,
      references: "organizations",
      onDelete: "cascade",
    },
    enabled: { type: "boolean", notNull: true, default: false },
    updated_by: { type: "uuid", references: "users", onDelete: "set null" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("lead_insights", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    contact_id: { type: "uuid", notNull: true, references: "contacts", onDelete: "cascade" },
    temperature: {
      type: "text",
      notNull: true,
      check: "temperature in ('quente', 'morno', 'frio')",
    },
    confidence: { type: "text", notNull: true, check: "confidence in ('baixa', 'media', 'alta')" },
    interest: { type: "text", notNull: true },
    next_step: { type: "text", notNull: true },
    summary: { type: "text", notNull: true },
    model: { type: "text" },
    status: {
      type: "text",
      notNull: true,
      default: "sugerida",
      check: "status in ('sugerida', 'aceita', 'descartada')",
    },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    reviewed_by: { type: "uuid", references: "users", onDelete: "set null" },
    reviewed_at: { type: "timestamptz" },
  });
  pgm.createIndex("lead_insights", ["organization_id", "contact_id", "created_at"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("lead_insights");
  pgm.dropTable("lead_settings");
}
