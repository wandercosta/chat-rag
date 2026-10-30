import { db } from "../../db/client.js";
import type { ContactFieldType, ContactFilter } from "../../db/types.js";

/** Etiquetas, campos personalizados e segmentos: tudo por organizacao. */
export const taxonomyRepository = {
  // --- etiquetas -----------------------------------------------------------
  listTags(organizationId: string) {
    return db
      .selectFrom("contact_tags")
      .select(["id", "name", "color"])
      .where("organization_id", "=", organizationId)
      .orderBy("name")
      .execute();
  },

  async ensureTag(organizationId: string, name: string, color?: string) {
    await db
      .insertInto("contact_tags")
      .values({ organization_id: organizationId, name, ...(color && { color }) })
      .onConflict((oc) => oc.columns(["organization_id", "name"]).doNothing())
      .execute();
    return db
      .selectFrom("contact_tags")
      .select(["id", "name", "color"])
      .where("organization_id", "=", organizationId)
      .where("name", "=", name)
      .executeTakeFirstOrThrow();
  },

  async removeTag(organizationId: string, id: string) {
    const r = await db
      .deleteFrom("contact_tags")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(r.numDeletedRows) > 0;
  },

  /** So etiquetas da propria organizacao entram na ligacao. */
  async setContactTags(organizationId: string, contactId: string, tagIds: string[]) {
    const valid = tagIds.length
      ? await db
          .selectFrom("contact_tags")
          .select("id")
          .where("organization_id", "=", organizationId)
          .where("id", "in", tagIds)
          .execute()
      : [];
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("contact_tag_links").where("contact_id", "=", contactId).execute();
      if (valid.length > 0) {
        await trx
          .insertInto("contact_tag_links")
          .values(valid.map((t) => ({ contact_id: contactId, tag_id: t.id })))
          .execute();
      }
    });
  },

  async addContactTags(contactId: string, tagIds: string[]) {
    if (tagIds.length === 0) return;
    await db
      .insertInto("contact_tag_links")
      .values(tagIds.map((tag_id) => ({ contact_id: contactId, tag_id })))
      .onConflict((oc) => oc.columns(["contact_id", "tag_id"]).doNothing())
      .execute();
  },

  tagsOf(contactIds: string[]) {
    if (contactIds.length === 0) return Promise.resolve([]);
    return db
      .selectFrom("contact_tag_links as l")
      .innerJoin("contact_tags as t", "t.id", "l.tag_id")
      .select(["l.contact_id", "t.id", "t.name", "t.color"])
      .where("l.contact_id", "in", contactIds)
      .orderBy("t.name")
      .execute();
  },

  // --- campos personalizados ------------------------------------------------
  listFields(organizationId: string) {
    return db
      .selectFrom("contact_fields")
      .select(["id", "key", "label", "type"])
      .where("organization_id", "=", organizationId)
      .orderBy("label")
      .execute();
  },

  insertField(organizationId: string, key: string, label: string, type: ContactFieldType) {
    return db
      .insertInto("contact_fields")
      .values({ organization_id: organizationId, key, label, type })
      .onConflict((oc) => oc.columns(["organization_id", "key"]).doNothing())
      .returning(["id", "key", "label", "type"])
      .executeTakeFirst();
  },

  async removeField(organizationId: string, id: string) {
    const r = await db
      .deleteFrom("contact_fields")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(r.numDeletedRows) > 0;
  },

  // --- segmentos -------------------------------------------------------------
  listSegments(organizationId: string) {
    return db
      .selectFrom("contact_segments")
      .select(["id", "name", "filter", "created_at"])
      .where("organization_id", "=", organizationId)
      .orderBy("name")
      .execute();
  },

  findSegment(organizationId: string, id: string) {
    return db
      .selectFrom("contact_segments")
      .select(["id", "name", "filter"])
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  insertSegment(organizationId: string, name: string, filter: ContactFilter) {
    return db
      .insertInto("contact_segments")
      .values({ organization_id: organizationId, name, filter: JSON.stringify(filter) })
      .onConflict((oc) => oc.columns(["organization_id", "name"]).doNothing())
      .returning(["id", "name", "filter"])
      .executeTakeFirst();
  },

  async removeSegment(organizationId: string, id: string) {
    const r = await db
      .deleteFrom("contact_segments")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(r.numDeletedRows) > 0;
  },
};
