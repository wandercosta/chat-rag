import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("visitors", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    external_user_id: { type: "text" },
    name: { type: "text" },
    email: { type: "citext" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("visitors", "organization_id");

  pgm.createTable("conversations", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    assistant_id: { type: "uuid", notNull: true, references: "assistants", onDelete: "cascade" },
    visitor_id: { type: "uuid", references: "visitors", onDelete: "set null" },
    channel: { type: "text", notNull: true },
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("conversations", "conversations_channel_check", {
    check: "channel in ('widget', 'whatsapp', 'playground')",
  });
  pgm.createIndex("conversations", "organization_id");
  pgm.createIndex("conversations", "assistant_id");

  pgm.createTable("messages", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    conversation_id: { type: "uuid", notNull: true, references: "conversations", onDelete: "cascade" },
    role: { type: "text", notNull: true },
    content: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("messages", "messages_role_check", {
    check: "role in ('visitante', 'assistente')",
  });
  pgm.createIndex("messages", "conversation_id");

  pgm.createTable("feedbacks", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    conversation_id: { type: "uuid", notNull: true, references: "conversations", onDelete: "cascade" },
    rating: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("feedbacks", "feedbacks_rating_check", {
    check: "rating in ('positivo', 'negativo')",
  });

  pgm.createTable("knowledge_gaps", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    assistant_id: { type: "uuid", notNull: true, references: "assistants", onDelete: "cascade" },
    question_normalized: { type: "text", notNull: true },
    frequency: { type: "integer", notNull: true, default: 1 },
    status: { type: "text", notNull: true, default: "pendente" },
    last_seen_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("knowledge_gaps", "knowledge_gaps_status_check", {
    check: "status in ('pendente', 'resolvida')",
  });
  pgm.addConstraint("knowledge_gaps", "knowledge_gaps_unique", {
    unique: ["assistant_id", "question_normalized"],
  });
  pgm.createIndex("knowledge_gaps", "organization_id");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("knowledge_gaps");
  pgm.dropTable("feedbacks");
  pgm.dropTable("messages");
  pgm.dropTable("conversations");
  pgm.dropTable("visitors");
}
