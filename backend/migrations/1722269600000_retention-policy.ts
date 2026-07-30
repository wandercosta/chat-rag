import type { MigrationBuilder } from "node-pg-migrate";

// Politica de retencao (docs/security/privacidade-e-acesso.md): padrao de
// plataforma e 90 dias; organizacao pode sobrescrever, e assistente pode
// sobrescrever de novo. NULL = "usa o nivel acima".
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("organizations", {
    retention_days: { type: "integer" },
  });
  pgm.addColumn("assistants", {
    retention_days: { type: "integer" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("assistants", "retention_days");
  pgm.dropColumn("organizations", "retention_days");
}
