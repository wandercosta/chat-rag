import { db } from "../../db/client.js";
import type { ConversationChannel, MessageCitation, MessageRole } from "../../db/types.js";

export interface ConversationFilters {
  assistantId?: string;
  visitorId?: string;
  from?: string;
  to?: string;
}

export const conversationsRepository = {
  listForOrganization(organizationId: string, filters: ConversationFilters) {
    let query = db
      .selectFrom("conversations")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("started_at", "desc")
      .limit(100);

    if (filters.assistantId) query = query.where("assistant_id", "=", filters.assistantId);
    if (filters.visitorId) query = query.where("visitor_id", "=", filters.visitorId);
    if (filters.from) query = query.where("started_at", ">=", new Date(filters.from));
    if (filters.to) query = query.where("started_at", "<=", new Date(filters.to));

    return query.execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("conversations")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  messagesFor(conversationId: string) {
    return db
      .selectFrom("messages")
      .selectAll()
      .where("conversation_id", "=", conversationId)
      .orderBy("created_at", "asc")
      .execute();
  },

  findActiveForVisitor(organizationId: string, assistantId: string, visitorId: string) {
    return db
      .selectFrom("conversations")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("assistant_id", "=", assistantId)
      .where("visitor_id", "=", visitorId)
      .orderBy("started_at", "desc")
      .executeTakeFirst();
  },

  start(
    organizationId: string,
    assistantId: string,
    channel: ConversationChannel,
    visitorId: string | null,
  ) {
    return db
      .insertInto("conversations")
      .values({
        organization_id: organizationId,
        assistant_id: assistantId,
        channel,
        visitor_id: visitorId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    citations: MessageCitation[] = [],
    authorUserId: string | null = null,
  ) {
    return db
      .insertInto("messages")
      .values({
        conversation_id: conversationId,
        role,
        content,
        citations: JSON.stringify(citations),
        author_user_id: authorUserId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** Conversas com o visitante, para a fila da caixa de entrada. Com `ids`,
   * so essas; sem, as mais recentes do canal. */
  listWithVisitor(
    organizationId: string,
    options: { ids?: string[]; channel?: ConversationChannel; contactId?: string; limit: number },
  ) {
    let query = db
      .selectFrom("conversations as c")
      .leftJoin("visitors as v", "v.id", "c.visitor_id")
      .select([
        "c.id",
        "c.assistant_id",
        "c.channel",
        "c.started_at",
        "c.contact_id",
        "v.name as visitor_name",
        "v.email as visitor_email",
        "v.external_user_id",
      ])
      .where("c.organization_id", "=", organizationId)
      .orderBy("c.started_at", "desc")
      .limit(options.limit);

    if (options.ids) query = query.where("c.id", "in", options.ids);
    if (options.channel) query = query.where("c.channel", "=", options.channel);
    if (options.contactId) query = query.where("c.contact_id", "=", options.contactId);
    return query.execute();
  },

  /** Ultima mensagem de cada conversa (uma linha por conversa). */
  lastMessages(conversationIds: string[]) {
    return db
      .selectFrom("messages")
      .select(["conversation_id", "role", "content", "created_at"])
      .distinctOn("conversation_id")
      .where("conversation_id", "in", conversationIds)
      .orderBy("conversation_id")
      .orderBy("created_at", "desc")
      .execute();
  },

  addFeedback(conversationId: string, rating: "positivo" | "negativo") {
    return db.insertInto("feedbacks").values({ conversation_id: conversationId, rating }).execute();
  },

  async setContact(organizationId: string, conversationId: string, contactId: string) {
    await db
      .updateTable("conversations")
      .set({ contact_id: contactId })
      .where("organization_id", "=", organizationId)
      .where("id", "=", conversationId)
      .execute();
  },

  /** Todas as conversas do mesmo visitante passam a ser do contato. */
  async setContactForVisitor(organizationId: string, visitorId: string, contactId: string) {
    await db
      .updateTable("conversations")
      .set({ contact_id: contactId })
      .where("organization_id", "=", organizationId)
      .where("visitor_id", "=", visitorId)
      .execute();
  },

  async deleteForContact(organizationId: string, contactId: string): Promise<number> {
    const result = await db
      .deleteFrom("conversations")
      .where("organization_id", "=", organizationId)
      .where("contact_id", "=", contactId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  },

  /** Expurgo por retencao (ADR-002 #6). Mensagens e feedbacks saem junto via
   * ON DELETE CASCADE. Retorna quantas conversas foram removidas. */
  async deleteOlderThan(assistantId: string, cutoff: Date): Promise<number> {
    const result = await db
      .deleteFrom("conversations")
      .where("assistant_id", "=", assistantId)
      .where("started_at", "<", cutoff)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  },
};
