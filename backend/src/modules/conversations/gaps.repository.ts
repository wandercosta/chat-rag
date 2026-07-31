import { db } from "../../db/client.js";

export const gapsRepository = {
  listForOrganization(organizationId: string) {
    return db
      .selectFrom("knowledge_gaps")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("frequency", "desc")
      .execute();
  },

  async upsertOccurrence(
    organizationId: string,
    assistantId: string,
    questionNormalized: string,
    details: { originalQuestion?: string; contextSnippet?: string | null } = {},
  ) {
    const now = new Date().toISOString();
    return db
      .insertInto("knowledge_gaps")
      .values({
        organization_id: organizationId,
        assistant_id: assistantId,
        question_normalized: questionNormalized,
        original_question: details.originalQuestion ?? null,
        context_snippet: details.contextSnippet ?? null,
        frequency: 1,
        status: "pendente",
        last_seen_at: now,
      })
      .onConflict((oc) =>
        // Reincidencia guarda o contexto mais recente: a ocorrencia de agora
        // e a mais util para quem for responder.
        oc.columns(["assistant_id", "question_normalized"]).doUpdateSet((eb) => ({
          frequency: eb("knowledge_gaps.frequency", "+", 1),
          last_seen_at: now,
          original_question: details.originalQuestion ?? null,
          context_snippet: details.contextSnippet ?? null,
        })),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  resolve(organizationId: string, id: string) {
    return db
      .updateTable("knowledge_gaps")
      .set({ status: "resolvida" })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("knowledge_gaps")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },
};
