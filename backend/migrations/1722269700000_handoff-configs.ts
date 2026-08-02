import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("handoff_configs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    assistant_id: { type: "uuid", notNull: true, references: "assistants", onDelete: "cascade" },
    sector_name: { type: "text", notNull: true },
    phone_number: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("handoff_configs", "assistant_id");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("handoff_configs");
}
