import type { MigrationBuilder } from "node-pg-migrate";

// Hierarquia (docs/workflows/rag-e-conhecimento.md): organizacao -> assistente
// -> colecoes -> topicos -> fontes -> chunks (chunks entram na migration do
// modulo rag, junto do worker de indexacao).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("knowledge_collections", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    requires_review: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("knowledge_collections", "organization_id");

  pgm.createTable("assistant_collections", {
    assistant_id: { type: "uuid", notNull: true, references: "assistants", onDelete: "cascade" },
    collection_id: {
      type: "uuid",
      notNull: true,
      references: "knowledge_collections",
      onDelete: "cascade",
    },
  });
  pgm.addConstraint("assistant_collections", "assistant_collections_pk", {
    primaryKey: ["assistant_id", "collection_id"],
  });

  pgm.createTable("topics", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    collection_id: { type: "uuid", references: "knowledge_collections", onDelete: "set null" },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("topics", "organization_id");
  pgm.createIndex("topics", "collection_id");

  pgm.createTable("sources", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    topic_id: { type: "uuid", notNull: true, references: "topics", onDelete: "cascade" },
    title: { type: "text", notNull: true },
    kind: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "rascunho" },
    origin_url: { type: "text" },
    raw_text: { type: "text" },
    storage_key: { type: "text" },
    error_message: { type: "text" },
    chunk_count: { type: "integer", notNull: true, default: 0 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("sources", "sources_kind_check", {
    check: "kind in ('texto', 'PDF', 'DOCX', 'URL')",
  });
  pgm.addConstraint("sources", "sources_status_check", {
    check:
      "status in ('rascunho', 'aguardando_revisao', 'aguardando_ativacao', 'fila', 'processando', 'pronta', 'erro', 'arquivada')",
  });
  pgm.createIndex("sources", "organization_id");
  pgm.createIndex("sources", "topic_id");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("sources");
  pgm.dropTable("topics");
  pgm.dropTable("assistant_collections");
  pgm.dropTable("knowledge_collections");
}
