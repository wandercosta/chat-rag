import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Revisao de fonte por assistente (backlog da Fase 3). Antes a revisao era so
 * por colecao (fonte nova entra "aguardando revisao"). Agora:
 * - sources.reviewed_at / reviewed_by: quem revisou e quando (ao aprovar uma
 *   fonte em revisao ou ao marcar como revisada uma fonte ja pronta).
 * - assistants.reviewed_sources_only: o assistente so responde com trechos
 *   de fontes revisadas, mesmo que a colecao nao exija revisao. Fontes ja
 *   existentes comecam sem revisao: ligar a opcao exige revisa-las.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("sources", {
    reviewed_at: { type: "timestamptz" },
    reviewed_by: { type: "uuid", references: "users", onDelete: "set null" },
  });
  pgm.addColumn("assistants", {
    reviewed_sources_only: { type: "boolean", notNull: true, default: false },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("assistants", "reviewed_sources_only");
  pgm.dropColumn("sources", ["reviewed_at", "reviewed_by"]);
}
