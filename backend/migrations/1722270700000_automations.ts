import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Automacoes (ADR-006 #4, etapa 7 da Fase 3): regras "quando / se / entao"
 * publicadas por uma pessoa. Nada aqui e decidido pela IA.
 *
 * - automation_rules: gatilho, condicoes e acoes (jsonb), ligada ou nao, e a
 *   versao (cada edicao soma 1; a execucao registra a versao que rodou).
 * - automation_runs: cada execucao, com o que aconteceu, para quem montou a
 *   regra conferir. Excluir a conversa ou o contato nao apaga o historico.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("automation_rules", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    name: { type: "text", notNull: true },
    enabled: { type: "boolean", notNull: true, default: false },
    trigger: { type: "text", notNull: true },
    conditions: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    actions: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    version: { type: "integer", notNull: true, default: 1 },
    updated_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("automation_rules", "automation_rules_trigger_check", {
    check: "trigger in ('mensagem_recebida', 'sem_resposta')",
  });
  pgm.createIndex("automation_rules", ["organization_id", "trigger", "enabled"]);

  pgm.createTable("automation_runs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    rule_id: { type: "uuid", notNull: true, references: "automation_rules", onDelete: "cascade" },
    rule_version: { type: "integer", notNull: true },
    conversation_id: { type: "uuid", references: "conversations", onDelete: "set null" },
    status: { type: "text", notNull: true },
    detail: { type: "text", notNull: true, default: "" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("automation_runs", "automation_runs_status_check", {
    check: "status in ('ok', 'erro')",
  });
  pgm.createIndex("automation_runs", ["rule_id", "created_at"]);
  pgm.createIndex("automation_runs", ["rule_id", "conversation_id"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("automation_runs");
  pgm.dropTable("automation_rules");
}
