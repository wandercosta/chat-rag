import type { MigrationBuilder } from "node-pg-migrate";

// Acesso de suporte do Master a um tenant: explicito, temporario e auditado
// (ADR-001 #14). Nenhuma rota tenant-scoped aceita o Master sem uma sessao
// ativa aqui — ver identity/plugin.ts (requireOrgRole / requireMasterSupportSession).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("support_access_sessions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    master_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    justification: { type: "text", notNull: true },
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    expires_at: { type: "timestamptz", notNull: true },
    ended_at: { type: "timestamptz" },
  });
  pgm.createIndex("support_access_sessions", ["master_user_id", "organization_id"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("support_access_sessions");
}
