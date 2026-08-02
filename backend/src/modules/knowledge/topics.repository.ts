import { db } from "../../db/client.js";

export const topicsRepository = {
  listForOrganization(organizationId: string) {
    return db
      .selectFrom("topics")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("name")
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("topics")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  insert(
    organizationId: string,
    name: string,
    description: string | null,
    collectionId: string | null,
  ) {
    return db
      .insertInto("topics")
      .values({ organization_id: organizationId, name, description, collection_id: collectionId })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** `collectionId: null` tira o topico da colecao (volta a ser um topico
   * solto, visivel para assistentes sem restricao — ver ADR-003). */
  update(
    organizationId: string,
    id: string,
    input: { name?: string; description?: string | null; collectionId?: string | null },
  ) {
    return db
      .updateTable("topics")
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.collectionId !== undefined && { collection_id: input.collectionId }),
      })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  },
};
