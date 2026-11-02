import type { MigrationBuilder } from "node-pg-migrate";

/**
 * CRM de contatos (ADR-006 #8, etapa 3 da Fase 3).
 *
 * - contacts: a pessoa no CRM da organizacao. Opt-in de campanha guarda
 *   quando e de onde veio (ADR-006 #9); opt-out vence o opt-in.
 * - contact_identities: como o contato aparece em cada canal (visitante do
 *   widget, e-mail, telefone e, nas proximas etapas, WhatsApp/Telegram...).
 *   Unica por organizacao + canal + valor: o mesmo telefone nao vira dois
 *   contatos no mesmo tenant.
 * - contact_tags / contact_tag_links: etiquetas por organizacao.
 * - contact_fields: definicao dos campos personalizados; os valores ficam em
 *   contacts.custom_fields (jsonb, chave = contact_fields.key).
 * - contact_segments: filtros salvos (base das campanhas, etapa 6).
 * - conversations.contact_id: a conversa pertence a um contato quando ele e
 *   identificado. Excluir o contato apaga as conversas dele (LGPD), por isso
 *   o servico remove as conversas antes; aqui fica `set null` como rede.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  const orgColumn = {
    type: "uuid",
    notNull: true,
    references: "organizations",
    onDelete: "cascade",
  } as const;

  pgm.createTable("contacts", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: orgColumn,
    name: { type: "text" },
    email: { type: "citext" },
    phone: { type: "text" },
    custom_fields: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    opt_in_at: { type: "timestamptz" },
    opt_in_source: { type: "text" },
    opted_out_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("contacts", "organization_id");
  pgm.createIndex("contacts", ["organization_id", "email"], {
    unique: true,
    where: "email is not null",
  });
  pgm.createIndex("contacts", ["organization_id", "phone"], {
    unique: true,
    where: "phone is not null",
  });

  pgm.createTable("contact_identities", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: orgColumn,
    contact_id: { type: "uuid", notNull: true, references: "contacts", onDelete: "cascade" },
    channel: { type: "text", notNull: true },
    value: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("contact_identities", "contact_identities_channel_check", {
    check: "channel in ('widget', 'whatsapp', 'telegram', 'instagram', 'messenger')",
  });
  pgm.addConstraint("contact_identities", "contact_identities_unique", {
    unique: ["organization_id", "channel", "value"],
  });
  pgm.createIndex("contact_identities", "contact_id");

  pgm.createTable("contact_tags", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: orgColumn,
    name: { type: "text", notNull: true },
    color: { type: "text", notNull: true, default: "#64748b" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("contact_tags", "contact_tags_name_unique", {
    unique: ["organization_id", "name"],
  });

  pgm.createTable("contact_tag_links", {
    contact_id: {
      type: "uuid",
      notNull: true,
      references: "contacts",
      onDelete: "cascade",
      primaryKey: true,
    },
    tag_id: {
      type: "uuid",
      notNull: true,
      references: "contact_tags",
      onDelete: "cascade",
      primaryKey: true,
    },
  });
  pgm.createIndex("contact_tag_links", "tag_id");

  pgm.createTable("contact_fields", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: orgColumn,
    key: { type: "text", notNull: true },
    label: { type: "text", notNull: true },
    type: { type: "text", notNull: true, default: "texto" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("contact_fields", "contact_fields_type_check", {
    check: "type in ('texto', 'numero', 'data')",
  });
  pgm.addConstraint("contact_fields", "contact_fields_key_unique", {
    unique: ["organization_id", "key"],
  });

  pgm.createTable("contact_segments", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: orgColumn,
    name: { type: "text", notNull: true },
    filter: { type: "jsonb", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("contact_segments", "contact_segments_name_unique", {
    unique: ["organization_id", "name"],
  });

  pgm.addColumn("conversations", {
    contact_id: { type: "uuid", references: "contacts", onDelete: "set null" },
  });
  pgm.createIndex("conversations", "contact_id");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("conversations", "contact_id");
  pgm.dropTable("contact_segments");
  pgm.dropTable("contact_fields");
  pgm.dropTable("contact_tag_links");
  pgm.dropTable("contact_tags");
  pgm.dropTable("contact_identities");
  pgm.dropTable("contacts");
}
