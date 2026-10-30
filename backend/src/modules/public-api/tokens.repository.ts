import { db } from "../../db/client.js";

/** Colunas que podem sair para o painel: o hash nunca. */
const PUBLIC_COLUMNS = [
  "id",
  "name",
  "token_prefix",
  "scopes",
  "created_at",
  "last_used_at",
  "revoked_at",
] as const;

export const tokensRepository = {
  list(organizationId: string) {
    return db
      .selectFrom("api_tokens")
      .select(PUBLIC_COLUMNS)
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "desc")
      .execute();
  },

  countActive(organizationId: string) {
    return db
      .selectFrom("api_tokens")
      .select(db.fn.countAll<string>().as("count"))
      .where("organization_id", "=", organizationId)
      .where("revoked_at", "is", null)
      .executeTakeFirstOrThrow();
  },

  insert(
    organizationId: string,
    values: { name: string; prefix: string; hash: string; scopes: string[]; createdBy: string },
  ) {
    return db
      .insertInto("api_tokens")
      .values({
        organization_id: organizationId,
        name: values.name,
        token_prefix: values.prefix,
        token_hash: values.hash,
        scopes: JSON.stringify(values.scopes),
        created_by: values.createdBy,
      })
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirstOrThrow();
  },

  revoke(organizationId: string, id: string) {
    return db
      .updateTable("api_tokens")
      .set({ revoked_at: new Date() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .where("revoked_at", "is", null)
      .returning(["id", "name"])
      .executeTakeFirst();
  },

  findActiveByHash(hash: string) {
    return db
      .selectFrom("api_tokens")
      .select(["id", "organization_id", "name", "scopes", "created_by", "last_used_at"])
      .where("token_hash", "=", hash)
      .where("revoked_at", "is", null)
      .executeTakeFirst();
  },

  touch(id: string) {
    return db
      .updateTable("api_tokens")
      .set({ last_used_at: new Date() })
      .where("id", "=", id)
      .execute();
  },
};
