import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Midia recebida pelos canais (backlog da Fase 3). Antes so o rotulo
 * "[imagem recebida]" ficava na mensagem; agora o arquivo e baixado do
 * provedor pelo worker e guardado no storage (bucket da plataforma, prefixo
 * `media/<organizacao>/`). A linha nasce "pendente" no recebimento e vira
 * "pronto" ou "falhou" (ex.: maior que CHANNEL_MEDIA_MAX_BYTES). O arquivo
 * sai junto com a mensagem: a retencao e a exclusao de contato apagam o
 * objeto antes de apagar as linhas.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("message_attachments", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    message_id: { type: "uuid", notNull: true, references: "messages", onDelete: "cascade" },
    kind: { type: "text", notNull: true },
    mime_type: { type: "text" },
    file_name: { type: "text" },
    size_bytes: { type: "integer" },
    storage_key: { type: "text" },
    status: { type: "text", notNull: true, default: "pendente" },
    error: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("message_attachments", "message_attachments_kind_check", {
    check: "kind in ('imagem', 'audio', 'video', 'documento', 'figurinha')",
  });
  pgm.addConstraint("message_attachments", "message_attachments_status_check", {
    check: "status in ('pendente', 'pronto', 'falhou')",
  });
  pgm.createIndex("message_attachments", "message_id");
  pgm.createIndex("message_attachments", "organization_id");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("message_attachments");
}
