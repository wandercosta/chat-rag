import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Gatilho "etiqueta adicionada" nas automacoes (backlog da Fase 3): roda
 * quando um contato ganha uma etiqueta (painel, importacao, API ou outra
 * automacao). A acao nova "enviar modelo do WhatsApp" nao precisa de coluna:
 * fica no jsonb de acoes.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint("automation_rules", "automation_rules_trigger_check");
  pgm.addConstraint("automation_rules", "automation_rules_trigger_check", {
    check: "trigger in ('mensagem_recebida', 'sem_resposta', 'etiqueta_adicionada')",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql("DELETE FROM automation_rules WHERE trigger = 'etiqueta_adicionada'");
  pgm.dropConstraint("automation_rules", "automation_rules_trigger_check");
  pgm.addConstraint("automation_rules", "automation_rules_trigger_check", {
    check: "trigger in ('mensagem_recebida', 'sem_resposta')",
  });
}
