import { db } from "../../db/client.js";

export const cannedResponsesRepository = {
  list(organizationId: string) {
    return db
      .selectFrom("canned_responses")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("title", "asc")
      .execute();
  },

  findByTitle(organizationId: string, title: string) {
    return db
      .selectFrom("canned_responses")
      .select("id")
      .where("organization_id", "=", organizationId)
      .where("title", "=", title)
      .executeTakeFirst();
  },

  insert(organizationId: string, title: string, content: string) {
    return db
      .insertInto("canned_responses")
      .values({ organization_id: organizationId, title, content })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async remove(organizationId: string, id: string): Promise<boolean> {
    const result = await db
      .deleteFrom("canned_responses")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  },
};
