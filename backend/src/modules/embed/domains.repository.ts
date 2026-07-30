import { db } from "../../db/client.js";

export const domainsRepository = {
  listForKey(embedKeyId: string) {
    return db.selectFrom("allowed_domains").selectAll().where("embed_key_id", "=", embedKeyId).execute();
  },

  add(embedKeyId: string, domain: string) {
    return db
      .insertInto("allowed_domains")
      .values({ embed_key_id: embedKeyId, domain })
      .onConflict((oc) => oc.doNothing())
      .execute();
  },

  remove(embedKeyId: string, domainId: string) {
    return db
      .deleteFrom("allowed_domains")
      .where("embed_key_id", "=", embedKeyId)
      .where("id", "=", domainId)
      .execute();
  },

  async isAllowed(embedKeyId: string, host: string): Promise<boolean> {
    const row = await db
      .selectFrom("allowed_domains")
      .select("id")
      .where("embed_key_id", "=", embedKeyId)
      .where("domain", "=", host)
      .executeTakeFirst();
    return Boolean(row);
  },
};
