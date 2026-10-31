import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Setores da caixa de entrada (backlog da Fase 3): grupos de quem atende
 * (ex.: Financeiro, Suporte). A conversa na fila pode ter um setor; quem e
 * Atendente ve na fila as conversas sem setor e as dos seus setores. A
 * transferencia muda pessoa e/ou setor e deixa uma nota interna.
 *
 * Nao confundir com `handoff_configs.sector_name`, que e o setor do
 * encaminhamento para um numero de WhatsApp fora da plataforma.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("inbox_sectors", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    name: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.sql(
    "CREATE UNIQUE INDEX inbox_sectors_name_unique ON inbox_sectors (organization_id, lower(name))",
  );

  pgm.createTable("inbox_sector_members", {
    sector_id: { type: "uuid", notNull: true, references: "inbox_sectors", onDelete: "cascade" },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
  });
  pgm.addConstraint("inbox_sector_members", "inbox_sector_members_pkey", {
    primaryKey: ["sector_id", "user_id"],
  });
  pgm.createIndex("inbox_sector_members", ["organization_id", "user_id"]);

  pgm.addColumn("conversation_assignments", {
    sector_id: { type: "uuid", references: "inbox_sectors", onDelete: "set null" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("conversation_assignments", "sector_id");
  pgm.dropTable("inbox_sector_members");
  pgm.dropTable("inbox_sectors");
}
