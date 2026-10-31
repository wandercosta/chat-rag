import { sql, type Selectable, type SelectQueryBuilder } from "kysely";
import { db } from "../../db/client.js";
import type { ContactFilter, ContactsTable, Database } from "../../db/types.js";

export type ContactRow = Selectable<ContactsTable>;

export interface ContactValues {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customFields?: Record<string, string>;
  optInAt?: Date | null;
  optInSource?: string | null;
  optedOutAt?: Date | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContactsQuery = SelectQueryBuilder<Database, "contacts", any>;

/** `%` e `_` digitados na busca sao texto, nao curinga. */
function likeTerm(value: string) {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Filtro de contatos (lista, segmento e, na etapa 6, publico de campanha).
 * Todos os criterios informados precisam valer ao mesmo tempo. */
function applyFilter(query: ContactsQuery, filter: ContactFilter): ContactsQuery {
  let q = query;
  const search = filter.search?.trim();
  if (search) {
    const term = likeTerm(search);
    const digits = search.replace(/\D/g, "");
    q = q.where((eb) =>
      eb.or([
        eb("contacts.name", "ilike", term),
        eb("contacts.email", "ilike", term),
        ...(digits.length >= 3 ? [eb("contacts.phone", "like", likeTerm(digits))] : []),
      ]),
    );
  }
  if (filter.optIn === true) {
    q = q.where("contacts.opt_in_at", "is not", null).where("contacts.opted_out_at", "is", null);
  } else if (filter.optIn === false) {
    q = q.where((eb) =>
      eb.or([eb("contacts.opt_in_at", "is", null), eb("contacts.opted_out_at", "is not", null)]),
    );
  }
  const tagIds = filter.tagIds ?? [];
  if (tagIds.length > 0) {
    q =
      filter.tagMatch === "all"
        ? q.where((eb) =>
            eb(
              eb
                .selectFrom("contact_tag_links")
                .select(eb.fn.countAll().as("n"))
                .whereRef("contact_tag_links.contact_id", "=", "contacts.id")
                .where("contact_tag_links.tag_id", "in", tagIds),
              "=",
              tagIds.length,
            ),
          )
        : q.where((eb) =>
            eb.exists(
              eb
                .selectFrom("contact_tag_links")
                .select("contact_tag_links.tag_id")
                .whereRef("contact_tag_links.contact_id", "=", "contacts.id")
                .where("contact_tag_links.tag_id", "in", tagIds),
            ),
          );
  }
  for (const field of filter.fields ?? []) {
    q = q.where(sql<string>`contacts.custom_fields ->> ${field.key}`, "=", field.value);
  }
  return q;
}

export const contactsRepository = {
  async list(organizationId: string, filter: ContactFilter, limit: number, offset: number) {
    const base = db.selectFrom("contacts").where("contacts.organization_id", "=", organizationId);
    const [items, total] = await Promise.all([
      applyFilter(base.selectAll("contacts"), filter)
        .orderBy("contacts.updated_at", "desc")
        .limit(limit)
        .offset(offset)
        .execute() as Promise<ContactRow[]>,
      applyFilter(
        base.select((eb) => eb.fn.countAll<string>().as("n")),
        filter,
      )
        .executeTakeFirstOrThrow()
        .then((r) => Number(r.n)),
    ]);
    return { items, total };
  },

  /** Ids de todos os contatos do filtro, para exportar e, depois, campanhas. */
  listAll(organizationId: string, filter: ContactFilter) {
    const base = db.selectFrom("contacts").where("contacts.organization_id", "=", organizationId);
    return applyFilter(base.selectAll("contacts"), filter)
      .orderBy("contacts.created_at")
      .execute() as Promise<ContactRow[]>;
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("contacts")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  findByIds(organizationId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return db
      .selectFrom("contacts")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "in", ids)
      .execute();
  },

  findByEmail(organizationId: string, email: string) {
    return db
      .selectFrom("contacts")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("email", "=", email)
      .executeTakeFirst();
  },

  findByPhone(organizationId: string, phone: string) {
    return db
      .selectFrom("contacts")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("phone", "=", phone)
      .executeTakeFirst();
  },

  insert(organizationId: string, values: ContactValues) {
    return db
      .insertInto("contacts")
      .values({
        organization_id: organizationId,
        name: values.name ?? null,
        email: values.email ?? null,
        phone: values.phone ?? null,
        custom_fields: JSON.stringify(values.customFields ?? {}),
        opt_in_at: values.optInAt ?? null,
        opt_in_source: values.optInSource ?? null,
        opted_out_at: values.optedOutAt ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(organizationId: string, id: string, values: ContactValues) {
    return db
      .updateTable("contacts")
      .set({
        ...(values.name !== undefined && { name: values.name }),
        ...(values.email !== undefined && { email: values.email }),
        ...(values.phone !== undefined && { phone: values.phone }),
        ...(values.customFields !== undefined && {
          custom_fields: JSON.stringify(values.customFields),
        }),
        ...(values.optInAt !== undefined && { opt_in_at: values.optInAt }),
        ...(values.optInSource !== undefined && { opt_in_source: values.optInSource }),
        ...(values.optedOutAt !== undefined && { opted_out_at: values.optedOutAt }),
        updated_at: new Date().toISOString(),
      })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  },

  async remove(organizationId: string, id: string): Promise<boolean> {
    const result = await db
      .deleteFrom("contacts")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  },
};
