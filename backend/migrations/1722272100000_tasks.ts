import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Tarefas com lembrete (ADR-008 #4): titulo, prazo, responsavel e ligacao
 * opcional com contato e/ou negocio. `reminded_at` marca o aviso de prazo
 * (uma vez); `done_at`/`done_by`, a conclusao. Excluir contato ou negocio
 * desliga a tarefa, nao apaga.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("tasks", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    title: { type: "text", notNull: true },
    notes: { type: "text" },
    due_at: { type: "timestamptz" },
    assignee_user_id: { type: "uuid", references: "users", onDelete: "set null" },
    contact_id: { type: "uuid", references: "contacts", onDelete: "set null" },
    deal_id: { type: "uuid", references: "deals", onDelete: "set null" },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    done_at: { type: "timestamptz" },
    done_by: { type: "uuid", references: "users", onDelete: "set null" },
    reminded_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("tasks", ["organization_id", "assignee_user_id", "done_at"]);
  pgm.createIndex("tasks", ["organization_id", "contact_id"]);
  pgm.createIndex("tasks", ["organization_id", "deal_id"]);
  pgm.sql(
    "CREATE INDEX tasks_due_reminder ON tasks (due_at) WHERE done_at IS NULL AND reminded_at IS NULL",
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("tasks");
}
