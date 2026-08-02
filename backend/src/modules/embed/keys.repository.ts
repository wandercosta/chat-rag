import { db } from "../../db/client.js";

export const keysRepository = {
  listForOrganization(organizationId: string) {
    return db
      .selectFrom("embed_keys")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "desc")
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("embed_keys")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  findActiveByHash(keyHash: string) {
    return db
      .selectFrom("embed_keys")
      .selectAll()
      .where("key_hash", "=", keyHash)
      .where("status", "=", "ativa")
      .executeTakeFirst();
  },

  insert(
    organizationId: string,
    assistantId: string,
    environment: "teste" | "producao",
    keyHash: string,
    masked: string,
  ) {
    return db
      .insertInto("embed_keys")
      .values({
        organization_id: organizationId,
        assistant_id: assistantId,
        environment,
        key_hash: keyHash,
        masked,
        status: "ativa",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  revoke(organizationId: string, id: string) {
    return db
      .updateTable("embed_keys")
      .set({ status: "revogada", revoked_at: new Date().toISOString() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .execute();
  },
};
