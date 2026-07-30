import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("visitors", {
    context: { type: "jsonb" },
  });
  pgm.createIndex("visitors", ["organization_id", "external_user_id"], {
    unique: true,
    where: "external_user_id is not null",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("visitors", ["organization_id", "external_user_id"]);
  pgm.dropColumn("visitors", "context");
}
