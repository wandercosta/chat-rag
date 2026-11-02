import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Campanhas (ADR-006 #9, etapa 6 da Fase 3).
 *
 * - campaigns: canal (conexao), publico (segmento), conteudo (modelo aprovado
 *   no WhatsApp, texto no Telegram), agendamento e ritmo. `audience_filter` e
 *   a foto do filtro no momento do agendamento: editar o segmento depois nao
 *   muda quem ja foi escolhido.
 * - campaign_recipients: um por contato, com o endereco no canal e a mensagem
 *   enviada; o recibo da mensagem (entregue, lida) vale para a campanha.
 *   Excluir o contato (LGPD) apaga a linha dele.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("campaigns", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    name: { type: "text", notNull: true },
    connection_id: { type: "uuid", references: "channel_connections", onDelete: "set null" },
    segment_id: { type: "uuid", references: "contact_segments", onDelete: "set null" },
    audience_filter: { type: "jsonb" },
    template_id: { type: "uuid", references: "channel_templates", onDelete: "set null" },
    template_params: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    text: { type: "text" },
    status: { type: "text", notNull: true, default: "rascunho" },
    rate_per_minute: { type: "integer", notNull: true, default: 30 },
    scheduled_at: { type: "timestamptz" },
    started_at: { type: "timestamptz" },
    finished_at: { type: "timestamptz" },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("campaigns", "campaigns_status_check", {
    check: "status in ('rascunho', 'agendada', 'enviando', 'concluida', 'cancelada')",
  });
  pgm.addConstraint("campaigns", "campaigns_rate_check", {
    check: "rate_per_minute between 1 and 600",
  });
  pgm.createIndex("campaigns", "organization_id");

  pgm.createTable("campaign_recipients", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    campaign_id: { type: "uuid", notNull: true, references: "campaigns", onDelete: "cascade" },
    contact_id: { type: "uuid", notNull: true, references: "contacts", onDelete: "cascade" },
    address: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "pendente" },
    message_id: { type: "uuid", references: "messages", onDelete: "set null" },
    error: { type: "text" },
    sent_at: { type: "timestamptz" },
  });
  pgm.addConstraint("campaign_recipients", "campaign_recipients_status_check", {
    check: "status in ('pendente', 'enviada', 'falhou', 'ignorada')",
  });
  pgm.addConstraint("campaign_recipients", "campaign_recipients_unique", {
    unique: ["campaign_id", "contact_id"],
  });
  pgm.createIndex("campaign_recipients", ["campaign_id", "status"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("campaign_recipients");
  pgm.dropTable("campaigns");
}
