import { db } from "../../db/client.js";

export const collectionsRepository = {
  listForOrganization(organizationId: string) {
    return db
      .selectFrom("knowledge_collections")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("name")
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("knowledge_collections")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  insert(organizationId: string, name: string, description: string | null, requiresReview: boolean) {
    return db
      .insertInto("knowledge_collections")
      .values({ organization_id: organizationId, name, description, requires_review: requiresReview })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  requiresReview(collectionId: string | null): Promise<boolean> {
    if (!collectionId) return Promise.resolve(false);
    return db
      .selectFrom("knowledge_collections")
      .select("requires_review")
      .where("id", "=", collectionId)
      .executeTakeFirst()
      .then((row) => row?.requires_review ?? false);
  },

  linkAssistant(assistantId: string, collectionId: string) {
    return db
      .insertInto("assistant_collections")
      .values({ assistant_id: assistantId, collection_id: collectionId })
      .onConflict((oc) => oc.doNothing())
      .execute();
  },

  unlinkAssistant(assistantId: string, collectionId: string) {
    return db
      .deleteFrom("assistant_collections")
      .where("assistant_id", "=", assistantId)
      .where("collection_id", "=", collectionId)
      .execute();
  },

  listForAssistant(assistantId: string) {
    return db
      .selectFrom("assistant_collections as ac")
      .innerJoin("knowledge_collections as c", "c.id", "ac.collection_id")
      .select(["c.id", "c.name", "c.description"])
      .where("ac.assistant_id", "=", assistantId)
      .execute();
  },

  /** Topicos que o assistente pode enxergar, atraves das colecoes vinculadas
   * a ele. Usado pelo modulo rag para escopar a recuperacao (nunca a base
   * inteira da organizacao). */
  async listAccessibleTopicIds(assistantId: string): Promise<string[]> {
    const rows = await db
      .selectFrom("assistant_collections as ac")
      .innerJoin("topics as t", "t.collection_id", "ac.collection_id")
      .select("t.id")
      .where("ac.assistant_id", "=", assistantId)
      .execute();
    return rows.map((r) => r.id);
  },
};
