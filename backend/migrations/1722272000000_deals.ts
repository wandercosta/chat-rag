import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Funil de vendas (ADR-008): funis e etapas por organizacao, negocios em
 * kanban e historico de mudanca de etapa. Etapa tem tipo aberta/ganho/perdido;
 * o negocio guarda o status derivado dela. Excluir o contato desliga o
 * negocio (contact_id vira null), nao apaga.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  const org = {
    type: "uuid",
    notNull: true,
    references: "organizations",
    onDelete: "cascade",
  } as const;

  pgm.createTable("pipelines", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: org,
    name: { type: "text", notNull: true },
    position: { type: "integer", notNull: true, default: 0 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("pipelines", ["organization_id", "position"]);

  pgm.createTable("pipeline_stages", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: org,
    pipeline_id: { type: "uuid", notNull: true, references: "pipelines", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    kind: { type: "text", notNull: true, check: "kind in ('aberta', 'ganho', 'perdido')" },
    position: { type: "integer", notNull: true, default: 0 },
  });
  pgm.createIndex("pipeline_stages", ["pipeline_id", "position"]);

  pgm.createTable("deals", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: org,
    pipeline_id: { type: "uuid", notNull: true, references: "pipelines", onDelete: "cascade" },
    stage_id: { type: "uuid", notNull: true, references: "pipeline_stages" },
    position: { type: "integer", notNull: true, default: 0 },
    title: { type: "text", notNull: true },
    value_cents: { type: "bigint", check: "value_cents >= 0" },
    contact_id: { type: "uuid", references: "contacts", onDelete: "set null" },
    owner_user_id: { type: "uuid", references: "users", onDelete: "set null" },
    expected_close_date: { type: "date" },
    status: {
      type: "text",
      notNull: true,
      default: "aberto",
      check: "status in ('aberto', 'ganho', 'perdido')",
    },
    lost_reason: { type: "text" },
    closed_at: { type: "timestamptz" },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("deals", ["organization_id", "pipeline_id", "stage_id", "position"]);
  pgm.createIndex("deals", ["organization_id", "contact_id"]);

  pgm.createTable("deal_stage_changes", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: org,
    deal_id: { type: "uuid", notNull: true, references: "deals", onDelete: "cascade" },
    from_stage_id: { type: "uuid", references: "pipeline_stages", onDelete: "set null" },
    to_stage_id: { type: "uuid", references: "pipeline_stages", onDelete: "set null" },
    changed_by: { type: "uuid", references: "users", onDelete: "set null" },
    changed_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("deal_stage_changes", ["deal_id", "changed_at"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("deal_stage_changes");
  pgm.dropTable("deals");
  pgm.dropTable("pipeline_stages");
  pgm.dropTable("pipelines");
}
