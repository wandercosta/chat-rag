import type { MigrationBuilder } from "node-pg-migrate";

// Eventos minimos de operacao (docs/observability/operacao.md): separado de
// audit_events porque este e sobre volume/desempenho/custo, nao seguranca —
// pode crescer muito e nao precisa da garantia append-only reforcada.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("usage_events", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    assistant_id: { type: "uuid", references: "assistants", onDelete: "cascade" },
    type: { type: "text", notNull: true },
    payload: { type: "jsonb", notNull: true, default: "{}" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("usage_events", ["organization_id", "created_at"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("usage_events");
}
