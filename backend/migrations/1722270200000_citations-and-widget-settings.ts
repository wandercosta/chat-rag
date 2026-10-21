import type { MigrationBuilder } from "node-pg-migrate";

/**
 * - messages.citations: trechos e documentos que embasaram cada resposta do
 *   assistente, exibidos no widget, no playground e na transcricao.
 * - assistants.widget_settings: aparencia do widget (titulo, saudacao, cor,
 *   posicao, tema) definida no painel. Atributos data-* do <script> continuam
 *   podendo sobrescrever cada campo no site hospedeiro.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("messages", {
    citations: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
  });
  pgm.addColumn("assistants", {
    widget_settings: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("assistants", "widget_settings");
  pgm.dropColumn("messages", "citations");
}
