import { db } from "../../db/client.js";
import type { ConversationChannel, MessageRole } from "../../db/types.js";

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

  start(organizationId: string, assistantId: string, channel: ConversationChannel, visitorId: string | null) {
    return db
      .insertInto("conversations")
      .values({ organization_id: organizationId, assistant_id: assistantId, channel, visitor_id: visitorId })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addMessage(conversationId: string, role: MessageRole, content: string) {
    return db
      .insertInto("messages")
      .values({ conversation_id: conversationId, role, content })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addFeedback(conversationId: string, rating: "positivo" | "negativo") {
    return db.insertInto("feedbacks").values({ conversation_id: conversationId, rating }).execute();
  },
};
