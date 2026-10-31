import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Configuracao da caixa de entrada por organizacao (backlog da Fase 3):
 * - first_response_minutes: meta de primeira resposta (SLA) depois do pedido
 *   de atendente; null = sem meta. A fila marca o que passou do prazo e o
 *   desempenho mostra quantas ficaram dentro.
 * - email_on_assignment: e-mail para quem recebe uma conversa atribuida ou
 *   transferida por outra pessoa (so com SMTP configurado na plataforma).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("inbox_settings", {
    organization_id: {
      type: "uuid",
      primaryKey: true,
      references: "organizations",
      onDelete: "cascade",
    },
    first_response_minutes: { type: "integer" },
    email_on_assignment: { type: "boolean", notNull: true, default: false },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("inbox_settings", "inbox_settings_minutes_check", {
    check: "first_response_minutes is null or first_response_minutes between 1 and 10080",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("inbox_settings");
}
