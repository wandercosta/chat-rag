import { db } from "../../db/client.js";

/** O que sai para o painel: nunca o hash da chave nem o segredo de identidade. */
const PUBLIC_COLUMNS = [
  "id",
  "organization_id",
  "assistant_id",
  "environment",
  "masked",
  "status",
  "created_at",
  "revoked_at",
  "identity_secret_hint",
  "require_signed_identity",
] as const;

export const keysRepository = {
  listForOrganization(organizationId: string) {
    return db
      .selectFrom("embed_keys")
      .select(PUBLIC_COLUMNS)
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "desc")
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("embed_keys")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  findActiveByHash(keyHash: string) {
    return db
      .selectFrom("embed_keys")
      .selectAll()
      .where("key_hash", "=", keyHash)
      .where("status", "=", "ativa")
      .executeTakeFirst();
  },

  insert(
    organizationId: string,
    assistantId: string,
    environment: "teste" | "producao",
    keyHash: string,
    masked: string,
  ) {
    return db
      .insertInto("embed_keys")
      .values({
        organization_id: organizationId,
        assistant_id: assistantId,
        environment,
        key_hash: keyHash,
        masked,
        status: "ativa",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async setIdentitySecret(
    organizationId: string,
    id: string,
    secret: { envelope: string; hint: string } | null,
  ) {
    const r = await db
      .updateTable("embed_keys")
      .set({
        identity_secret: secret?.envelope ?? null,
        identity_secret_hint: secret?.hint ?? null,
        // Sem segredo nao ha como exigir assinatura.
        ...(secret === null && { require_signed_identity: false }),
      })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(r.numUpdatedRows) > 0;
  },

  async setRequireSignedIdentity(organizationId: string, id: string, on: boolean) {
    await db
      .updateTable("embed_keys")
      .set({ require_signed_identity: on })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .execute();
  },

  revoke(organizationId: string, id: string) {
    return db
      .updateTable("embed_keys")
      .set({ status: "revogada", revoked_at: new Date().toISOString() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .execute();
  },
};
