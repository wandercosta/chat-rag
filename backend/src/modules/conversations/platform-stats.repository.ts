import { sql } from "kysely";
import { db } from "../../db/client.js";

/**
 * Contagens cruzando organizacoes, so para a visao geral do Master. Nunca
 * devolve conteudo de mensagem nem dado de contato: apenas numeros por
 * organizacao, canal e dia.
 */
export const platformStatsRepository = {
  conversationsByOrganization(since: Date) {
    return db
      .selectFrom("conversations")
      .select(["organization_id", sql<string>`count(*)`.as("count")])
      .where("started_at", ">=", since)
      .groupBy("organization_id")
      .execute();
  },

  messagesByOrganization(since: Date) {
    return db
      .selectFrom("messages as m")
      .innerJoin("conversations as c", "c.id", "m.conversation_id")
      .select([
        "c.organization_id",
        sql<string>`count(*) filter (where m.role = 'visitante')`.as("received"),
        sql<string>`count(*) filter (where m.role = 'assistente')`.as("assistant"),
        sql<string>`count(*) filter (where m.role = 'atendente')`.as("agent"),
      ])
      .where("m.created_at", ">=", since)
      .groupBy("c.organization_id")
      .execute();
  },

  conversationsByChannel(since: Date) {
    return db
      .selectFrom("conversations")
      .select(["channel", sql<string>`count(*)`.as("count")])
      .where("started_at", ">=", since)
      .groupBy("channel")
      .execute();
  },

  /** Mensagens recebidas por dia (fuso do banco), para o grafico do periodo. */
  receivedPerDay(since: Date) {
    return db
      .selectFrom("messages")
      .select([
        sql<string>`to_char(date_trunc('day', created_at), 'YYYY-MM-DD')`.as("day"),
        sql<string>`count(*)`.as("count"),
      ])
      .where("role", "=", "visitante")
      .where("created_at", ">=", since)
      .groupBy(sql`date_trunc('day', created_at)`)
      .orderBy(sql`date_trunc('day', created_at)`)
      .execute();
  },
};
