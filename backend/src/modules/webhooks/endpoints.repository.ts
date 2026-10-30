import { sql } from "kysely";
import { db } from "../../db/client.js";
import type { SerializedEnvelope } from "../../crypto/envelope.js";

/** Colunas que podem sair para o painel: o segredo nunca. */
const PUBLIC_COLUMNS = ["id", "url", "events", "enabled", "created_at", "updated_at"] as const;

export const endpointsRepository = {
  list(organizationId: string) {
    return db
      .selectFrom("webhook_endpoints")
      .select(PUBLIC_COLUMNS)
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "asc")
      .execute();
  },

  insert(
    organizationId: string,
    values: { url: string; events: string[]; secret: SerializedEnvelope; createdBy: string },
  ) {
    return db
      .insertInto("webhook_endpoints")
      .values({
        organization_id: organizationId,
        url: values.url,
        events: JSON.stringify(values.events),
        secret: JSON.stringify(values.secret),
        created_by: values.createdBy,
      })
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirstOrThrow();
  },

  update(
    organizationId: string,
    id: string,
    values: { url?: string; events?: string[]; enabled?: boolean; secret?: SerializedEnvelope },
  ) {
    return db
      .updateTable("webhook_endpoints")
      .set({
        ...(values.url !== undefined && { url: values.url }),
        ...(values.events !== undefined && { events: JSON.stringify(values.events) }),
        ...(values.enabled !== undefined && { enabled: values.enabled }),
        ...(values.secret !== undefined && { secret: JSON.stringify(values.secret) }),
        updated_at: new Date().toISOString(),
      })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirst();
  },

  async remove(organizationId: string, id: string) {
    const result = await db
      .deleteFrom("webhook_endpoints")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  },

  /** Ligados e assinando o evento. */
  subscribedTo(organizationId: string, event: string) {
    return db
      .selectFrom("webhook_endpoints")
      .select("id")
      .where("organization_id", "=", organizationId)
      .where("enabled", "=", true)
      .where(sql<boolean>`events ? ${event}`)
      .execute();
  },

  findWithSecret(id: string) {
    return db
      .selectFrom("webhook_endpoints")
      .select(["id", "organization_id", "url", "enabled", "secret"])
      .where("id", "=", id)
      .executeTakeFirst();
  },
};
