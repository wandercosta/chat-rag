import { db } from "../../db/client.js";
import type { ContactChannel } from "../../db/types.js";

export const identitiesRepository = {
  find(organizationId: string, channel: ContactChannel, value: string) {
    return db
      .selectFrom("contact_identities")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("channel", "=", channel)
      .where("value", "=", value)
      .executeTakeFirst();
  },

  listFor(organizationId: string, contactId: string) {
    return db
      .selectFrom("contact_identities")
      .select(["id", "channel", "value", "created_at"])
      .where("organization_id", "=", organizationId)
      .where("contact_id", "=", contactId)
      .orderBy("created_at")
      .execute();
  },

  /** Endereco de cada contato num canal (publico de campanha). */
  async addressesFor(organizationId: string, contactIds: string[], channel: ContactChannel) {
    if (contactIds.length === 0) return new Map<string, string>();
    const rows = await db
      .selectFrom("contact_identities")
      .select(["contact_id", "value"])
      .where("organization_id", "=", organizationId)
      .where("channel", "=", channel)
      .where("contact_id", "in", contactIds)
      .execute();
    return new Map(rows.map((r) => [r.contact_id, r.value]));
  },

  /** Idempotente: a mesma identidade chegando duas vezes (duas abas do widget
   * ao mesmo tempo) nao quebra pela restricao de unicidade. */
  async link(organizationId: string, contactId: string, channel: ContactChannel, value: string) {
    await db
      .insertInto("contact_identities")
      .values({ organization_id: organizationId, contact_id: contactId, channel, value })
      .onConflict((oc) => oc.columns(["organization_id", "channel", "value"]).doNothing())
      .execute();
    return this.find(organizationId, channel, value);
  },
};
