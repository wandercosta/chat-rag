import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Canais oficiais (ADR-006 #6 e #7, etapas 4 e 5 da Fase 3).
 *
 * - channel_connections: canal conectado pelo tenant (WhatsApp agora;
 *   Telegram, Instagram e Messenger na etapa 5). `external_id` e o id do
 *   numero/bot/pagina no provedor, unico na plataforma: o webhook chega por
 *   ele. Token e segredo do app ficam em `secret` (envelope encryption, nunca
 *   devolvido por API); `verify_token` e o texto que o tenant cola na Meta.
 * - channel_templates: modelos aprovados sincronizados do provedor.
 * - conversations.channel_connection_id: por qual conexao a conversa chegou.
 * - messages.provider_message_id: id da mensagem no provedor, unico, para o
 *   webhook ser idempotente; delivery_status acompanha enviada > entregue >
 *   lida (ou falhou).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("channel_connections", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    assistant_id: { type: "uuid", notNull: true, references: "assistants", onDelete: "cascade" },
    provider: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
    external_id: { type: "text", notNull: true },
    config: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    secret: { type: "jsonb", notNull: true },
    secret_hint: { type: "text", notNull: true },
    verify_token: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "ativo" },
    status_detail: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("channel_connections", "channel_connections_provider_check", {
    check: "provider in ('whatsapp', 'telegram', 'instagram', 'messenger')",
  });
  pgm.addConstraint("channel_connections", "channel_connections_status_check", {
    check: "status in ('ativo', 'erro', 'inativo')",
  });
  pgm.addConstraint("channel_connections", "channel_connections_external_unique", {
    unique: ["provider", "external_id"],
  });
  pgm.createIndex("channel_connections", "organization_id");

  pgm.createTable("channel_templates", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    connection_id: {
      type: "uuid",
      notNull: true,
      references: "channel_connections",
      onDelete: "cascade",
    },
    name: { type: "text", notNull: true },
    language: { type: "text", notNull: true },
    category: { type: "text" },
    status: { type: "text", notNull: true },
    body: { type: "text", notNull: true, default: "" },
    variables: { type: "integer", notNull: true, default: 0 },
    synced_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("channel_templates", "channel_templates_unique", {
    unique: ["connection_id", "name", "language"],
  });

  pgm.dropConstraint("conversations", "conversations_channel_check");
  pgm.addConstraint("conversations", "conversations_channel_check", {
    check: "channel in ('widget', 'whatsapp', 'playground', 'telegram', 'instagram', 'messenger')",
  });
  pgm.addColumn("conversations", {
    channel_connection_id: {
      type: "uuid",
      references: "channel_connections",
      onDelete: "set null",
    },
  });
  pgm.createIndex("conversations", ["channel_connection_id", "contact_id"]);

  pgm.addColumn("messages", {
    provider_message_id: { type: "text" },
    delivery_status: { type: "text" },
    delivery_error: { type: "text" },
  });
  pgm.addConstraint("messages", "messages_delivery_status_check", {
    check: "delivery_status in ('enviando', 'enviada', 'entregue', 'lida', 'falhou')",
  });
  pgm.createIndex("messages", "provider_message_id", {
    unique: true,
    where: "provider_message_id is not null",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint("messages", "messages_delivery_status_check");
  pgm.dropColumn("messages", ["provider_message_id", "delivery_status", "delivery_error"]);
  pgm.dropColumn("conversations", "channel_connection_id");
  pgm.sql("DELETE FROM conversations WHERE channel IN ('telegram', 'instagram', 'messenger')");
  pgm.dropConstraint("conversations", "conversations_channel_check");
  pgm.addConstraint("conversations", "conversations_channel_check", {
    check: "channel in ('widget', 'whatsapp', 'playground')",
  });
  pgm.dropTable("channel_templates");
  pgm.dropTable("channel_connections");
}
