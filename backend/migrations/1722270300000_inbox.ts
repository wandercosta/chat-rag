import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Caixa de entrada compartilhada (ADR-006, etapa 2 da Fase 3).
 *
 * - memberships: papel "Atendente" (responde e resolve conversas, sem gerir
 *   base, chaves ou usuarios).
 * - assistants.human_inbox_enabled: o pedido de atendente no widget cai na
 *   fila do painel em vez de abrir o WhatsApp por link.
 * - messages: autor "atendente" e o usuario que respondeu (responsavel humano
 *   identificavel, ADR-006 #3).
 * - conversation_assignments: status e atribuicao. Conversa sem linha aqui
 *   esta so com o assistente; com linha nao resolvida, o assistente nao
 *   responde. Tabela do modulo inbox, separada de `conversations` para
 *   respeitar a fronteira do ADR-002 #2.
 * - conversation_notes: notas internas, nunca enviadas ao visitante.
 * - canned_responses: respostas prontas por organizacao.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint("memberships", "memberships_role_check");
  pgm.addConstraint("memberships", "memberships_role_check", {
    check: "role in ('Administrador', 'Editor de base', 'Analista', 'Atendente')",
  });

  pgm.addColumn("assistants", {
    human_inbox_enabled: { type: "boolean", notNull: true, default: false },
  });

  pgm.dropConstraint("messages", "messages_role_check");
  pgm.addConstraint("messages", "messages_role_check", {
    check: "role in ('visitante', 'assistente', 'atendente')",
  });
  pgm.addColumn("messages", {
    author_user_id: { type: "uuid", references: "users", onDelete: "set null" },
  });

  pgm.createTable("conversation_assignments", {
    conversation_id: {
      type: "uuid",
      primaryKey: true,
      references: "conversations",
      onDelete: "cascade",
    },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    status: { type: "text", notNull: true, default: "aberta" },
    assigned_user_id: { type: "uuid", references: "users", onDelete: "set null" },
    requested_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("conversation_assignments", "conversation_assignments_status_check", {
    check: "status in ('aberta', 'pendente', 'resolvida')",
  });
  pgm.createIndex("conversation_assignments", ["organization_id", "status"]);

  pgm.createTable("conversation_notes", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    conversation_id: {
      type: "uuid",
      notNull: true,
      references: "conversations",
      onDelete: "cascade",
    },
    author_user_id: { type: "uuid", references: "users", onDelete: "set null" },
    content: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("conversation_notes", "conversation_id");

  pgm.createTable("canned_responses", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    title: { type: "text", notNull: true },
    content: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("canned_responses", "canned_responses_title_unique", {
    unique: ["organization_id", "title"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("canned_responses");
  pgm.dropTable("conversation_notes");
  pgm.dropTable("conversation_assignments");
  pgm.dropColumn("messages", "author_user_id");
  pgm.sql("DELETE FROM messages WHERE role = 'atendente'");
  pgm.dropConstraint("messages", "messages_role_check");
  pgm.addConstraint("messages", "messages_role_check", {
    check: "role in ('visitante', 'assistente')",
  });
  pgm.dropColumn("assistants", "human_inbox_enabled");
  pgm.sql("UPDATE memberships SET role = 'Analista' WHERE role = 'Atendente'");
  pgm.dropConstraint("memberships", "memberships_role_check");
  pgm.addConstraint("memberships", "memberships_role_check", {
    check: "role in ('Administrador', 'Editor de base', 'Analista')",
  });
}
