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

  /**
   * Topicos que o assistente pode enxergar (ADR-003): colecao e um filtro
   * opcional de restricao, nao um pre-requisito. Sem nenhuma colecao
   * vinculada, o assistente consulta toda a base da propria organizacao;
   * com colecoes vinculadas, so os topicos delas. O `organization_id`
   * continua sendo a fronteira real e nunca e atravessado.
   */
  async listAccessibleTopicIds(organizationId: string, assistantId: string): Promise<string[]> {
    const linked = await db
      .selectFrom("assistant_collections as ac")
      .innerJoin("topics as t", "t.collection_id", "ac.collection_id")
      .select("t.id")
      .where("ac.assistant_id", "=", assistantId)
      .execute();

    if (linked.length > 0) return linked.map((r) => r.id);

    const hasRestriction = await db
      .selectFrom("assistant_collections")
      .select("collection_id")
      .where("assistant_id", "=", assistantId)
      .executeTakeFirst();
    // Colecoes vinculadas mas todas vazias continuam significando restricao
    // explicita — devolver a base inteira aqui iria contra a intencao do tenant.
    if (hasRestriction) return [];

    const all = await db
      .selectFrom("topics")
      .select("id")
      .where("organization_id", "=", organizationId)
      .execute();
    return all.map((r) => r.id);
  },
};
