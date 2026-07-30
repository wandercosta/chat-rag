import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Catalogo curto de modelos aprovados, mantido pelo Master (ADR-001 #15).
  pgm.createTable("ai_model_catalog", {
    id: { type: "text", primaryKey: true },
    label: { type: "text", notNull: true },
    note: { type: "text" },
    enabled: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("tenant_allowed_models", {
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    model_id: {
      type: "text",
      notNull: true,
      references: "ai_model_catalog",
      onDelete: "cascade",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("tenant_allowed_models", "tenant_allowed_models_pk", {
    primaryKey: ["organization_id", "model_id"],
  });

  pgm.createTable("assistants", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    name: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "rascunho" },
    model_id: { type: "text", notNull: true, references: "ai_model_catalog" },
    // 'geral' (conhecimento geral alem da base) e recurso futuro (ADR-001 #8);
    // a constraint abaixo mantem so 'estrita' habilitada ate o recurso existir.
    response_mode: { type: "text", notNull: true, default: "estrita" },
    instructions: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("assistants", "assistants_status_check", {
    check: "status in ('publicado', 'rascunho', 'pausado')",
  });
  pgm.addConstraint("assistants", "assistants_response_mode_check", {
    check: "response_mode in ('estrita')",
  });
  pgm.createIndex("assistants", "organization_id");

  pgm.sql(`
    INSERT INTO ai_model_catalog (id, label, note) VALUES
      ('gpt-4o-mini', 'gpt-4o-mini', 'Padrao - custo baixo'),
      ('gpt-4o', 'gpt-4o', 'Respostas longas'),
      ('gpt-4.1-mini', 'gpt-4.1-mini', 'Equilibrio')
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("assistants");
  pgm.dropTable("tenant_allowed_models");
  pgm.dropTable("ai_model_catalog");
}
