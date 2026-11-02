import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Chat interno da equipe do tenant: um canal "Geral" por organizacao e
 * conversas diretas entre duas pessoas (user_a < user_b, unica por par).
 * Mensagem interna nunca vai para cliente nem para o assistente. Leitura por
 * pessoa e thread em team_thread_reads (contagem de nao lidas).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("team_threads", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    kind: { type: "text", notNull: true, check: "kind in ('geral', 'direto')" },
    user_a: { type: "uuid", references: "users", onDelete: "cascade" },
    user_b: { type: "uuid", references: "users", onDelete: "cascade" },
    last_message_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("team_threads", "team_threads_direct_pair", {
    check:
      "(kind = 'geral' and user_a is null and user_b is null) or (kind = 'direto' and user_a < user_b)",
  });
  pgm.sql(
    "CREATE UNIQUE INDEX team_threads_general_unique ON team_threads (organization_id) WHERE kind = 'geral'",
  );
  pgm.sql(
    "CREATE UNIQUE INDEX team_threads_direct_unique ON team_threads (organization_id, user_a, user_b) WHERE kind = 'direto'",
  );

  pgm.createTable("team_messages", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    thread_id: { type: "uuid", notNull: true, references: "team_threads", onDelete: "cascade" },
    author_user_id: { type: "uuid", references: "users", onDelete: "set null" },
    content: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("team_messages", ["thread_id", "created_at"]);
  pgm.createIndex("team_messages", ["organization_id", "created_at"]);

  pgm.createTable("team_thread_reads", {
    thread_id: { type: "uuid", notNull: true, references: "team_threads", onDelete: "cascade" },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    last_read_at: { type: "timestamptz", notNull: true },
  });
  pgm.addConstraint("team_thread_reads", "team_thread_reads_pkey", {
    primaryKey: ["thread_id", "user_id"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("team_thread_reads");
  pgm.dropTable("team_messages");
  pgm.dropTable("team_threads");
}
