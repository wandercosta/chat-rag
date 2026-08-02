import { db } from "../../db/client.js";

export const handoffRepository = {
  listForAssistant(assistantId: string) {
    return db
      .selectFrom("handoff_configs")
      .selectAll()
      .where("assistant_id", "=", assistantId)
      .orderBy("sector_name")
      .execute();
  },

  findById(assistantId: string, id: string) {
    return db
      .selectFrom("handoff_configs")
      .selectAll()
      .where("assistant_id", "=", assistantId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  insert(organizationId: string, assistantId: string, sectorName: string, phoneNumber: string) {
    return db
      .insertInto("handoff_configs")
      .values({
        organization_id: organizationId,
        assistant_id: assistantId,
        sector_name: sectorName,
        phone_number: phoneNumber,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  remove(assistantId: string, id: string) {
    return db
      .deleteFrom("handoff_configs")
      .where("assistant_id", "=", assistantId)
      .where("id", "=", id)
      .execute();
  },
};
