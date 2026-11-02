import { db } from "../../db/client.js";

/** Texto que fica no lugar de cada mensagem anonimizada. */
export const ANONYMIZED_CONTENT = "[conteudo removido pela politica de retencao]";

/** Retencao em modo "anonimizar" (organizations.retention_mode). */
export const anonymizeRepository = {
  /** Conversas do assistente alem do prazo que ainda nao foram anonimizadas. */
  async expiredIds(assistantId: string, cutoff: Date) {
    const rows = await db
      .selectFrom("conversations")
      .select("id")
      .where("assistant_id", "=", assistantId)
      .where("started_at", "<", cutoff)
      .where("anonymized_at", "is", null)
      .execute();
    return rows.map((r) => r.id);
  },

  /**
   * Mantem papel, horario e recibo das mensagens (metricas e contagens) e
   * tira tudo que identifica ou conta algo: texto, fontes citadas, erro do
   * provedor e a ligacao com visitante e contato.
   */
  async anonymize(conversationIds: string[]) {
    if (conversationIds.length === 0) return;
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("messages")
        .set({ content: ANONYMIZED_CONTENT, citations: "[]", delivery_error: null })
        .where("conversation_id", "in", conversationIds)
        .execute();
      await trx
        .updateTable("conversations")
        .set({ visitor_id: null, contact_id: null, anonymized_at: new Date().toISOString() })
        .where("id", "in", conversationIds)
        .execute();
    });
  },
};
