import { db } from "../../db/client.js";

export const PAGE_SIZE = 50;

export const messagesRepository = {
  /** Pagina mais recente (ou anterior a `before`), em ordem cronologica. */
  async list(threadId: string, before?: Date) {
    let query = db
      .selectFrom("team_messages")
      .select(["id", "author_user_id", "content", "created_at"])
      .where("thread_id", "=", threadId)
      .orderBy("created_at", "desc")
      .limit(PAGE_SIZE);
    if (before) query = query.where("created_at", "<", before);
    return (await query.execute()).reverse();
  },

  insert(organizationId: string, threadId: string, authorUserId: string, content: string) {
    return db.transaction().execute(async (trx) => {
      const message = await trx
        .insertInto("team_messages")
        .values({
          organization_id: organizationId,
          thread_id: threadId,
          author_user_id: authorUserId,
          content,
        })
        .returning(["id", "author_user_id", "content", "created_at"])
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("team_threads")
        .set({ last_message_at: message.created_at })
        .where("id", "=", threadId)
        .execute();
      return message;
    });
  },

  /** Retencao: o chat interno segue o prazo da organizacao. */
  async deleteOlderThan(organizationId: string, cutoff: Date) {
    const result = await db
      .deleteFrom("team_messages")
      .where("organization_id", "=", organizationId)
      .where("created_at", "<", cutoff)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  },

  organizationsWithMessages() {
    return db
      .selectFrom("team_messages")
      .select("organization_id")
      .distinct()
      .execute()
      .then((rows) => rows.map((r) => r.organization_id));
  },
};
