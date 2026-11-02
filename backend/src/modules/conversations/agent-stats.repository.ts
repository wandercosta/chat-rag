import { db } from "../../db/client.js";

export const agentStatsRepository = {
  /**
   * Por conversa e atendente: a primeira resposta e quantas mensagens ele
   * mandou desde `since`. A organizacao vem da conversa, nunca do chamador
   * sozinho (fronteira de tenant).
   */
  repliesSince(organizationId: string, since: Date) {
    return db
      .selectFrom("messages as m")
      .innerJoin("conversations as c", "c.id", "m.conversation_id")
      .select((eb) => [
        "m.conversation_id",
        "m.author_user_id",
        eb.fn.min("m.created_at").as("first_at"),
        eb.fn.countAll<string>().as("count"),
      ])
      .where("c.organization_id", "=", organizationId)
      .where("m.role", "=", "atendente")
      .where("m.author_user_id", "is not", null)
      .where("m.created_at", ">=", since)
      .groupBy(["m.conversation_id", "m.author_user_id"])
      .execute();
  },

  /** Ultima resposta de atendente em cada conversa (prazo de primeira resposta). */
  lastAgentReplies(organizationId: string, conversationIds: string[]) {
    return db
      .selectFrom("messages as m")
      .innerJoin("conversations as c", "c.id", "m.conversation_id")
      .select((eb) => ["m.conversation_id", eb.fn.max("m.created_at").as("at")])
      .where("c.organization_id", "=", organizationId)
      .where("m.conversation_id", "in", conversationIds)
      .where("m.role", "=", "atendente")
      .groupBy("m.conversation_id")
      .execute();
  },
};
