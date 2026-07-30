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

  async upsertOccurrence(organizationId: string, assistantId: string, questionNormalized: string) {
    return db
      .insertInto("knowledge_gaps")
      .values({
        organization_id: organizationId,
        assistant_id: assistantId,
        question_normalized: questionNormalized,
        frequency: 1,
        status: "pendente",
        last_seen_at: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.columns(["assistant_id", "question_normalized"]).doUpdateSet((eb) => ({
          frequency: eb("knowledge_gaps.frequency", "+", 1),
          last_seen_at: new Date().toISOString(),
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
