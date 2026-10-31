import { db } from "../../db/client.js";
import type { ChannelProvider } from "../../db/types.js";
import type { SerializedEnvelope } from "../../crypto/envelope.js";

/** Colunas que podem sair para o painel: nunca `secret`. */
const PUBLIC_COLUMNS = [
  "id",
  "organization_id",
  "assistant_id",
  "provider",
  "name",
  "external_id",
  "config",
  "secret_hint",
  "verify_token",
  "status",
  "status_detail",
  "created_at",
  "updated_at",
] as const;

export interface NewConnection {
  organizationId: string;
  assistantId: string;
  provider: ChannelProvider;
  name: string;
  externalId: string;
  config: Record<string, string>;
  secret: SerializedEnvelope;
  secretHint: string;
  verifyToken: string;
}

export const connectionsRepository = {
  list(organizationId: string) {
    return db
      .selectFrom("channel_connections")
      .select(PUBLIC_COLUMNS)
      .where("organization_id", "=", organizationId)
      .orderBy("created_at")
      .execute();
  },

  /** Visao do Master: so estado e identificacao, nunca segredo nem token de verificacao. */
  listForMaster(organizationId: string) {
    return db
      .selectFrom("channel_connections")
      .select([
        "id",
        "provider",
        "name",
        "external_id",
        "config",
        "status",
        "status_detail",
        "created_at",
        "updated_at",
      ])
      .where("organization_id", "=", organizationId)
      .orderBy("created_at")
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("channel_connections")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  /** So para o webhook e o worker: a organizacao vem da propria conexao. */
  findByIdForWebhook(id: string) {
    return db.selectFrom("channel_connections").selectAll().where("id", "=", id).executeTakeFirst();
  },

  /** Webhook unico do app da plataforma: a conexao vem pelo numero. */
  findByExternalForWebhook(provider: ChannelProvider, externalId: string) {
    return db
      .selectFrom("channel_connections")
      .selectAll()
      .where("provider", "=", provider)
      .where("external_id", "=", externalId)
      .executeTakeFirst();
  },

  existsExternal(provider: ChannelProvider, externalId: string) {
    return db
      .selectFrom("channel_connections")
      .select("id")
      .where("provider", "=", provider)
      .where("external_id", "=", externalId)
      .executeTakeFirst();
  },

  insert(input: NewConnection) {
    return db
      .insertInto("channel_connections")
      .values({
        organization_id: input.organizationId,
        assistant_id: input.assistantId,
        provider: input.provider,
        name: input.name,
        external_id: input.externalId,
        config: JSON.stringify(input.config),
        secret: JSON.stringify(input.secret),
        secret_hint: input.secretHint,
        verify_token: input.verifyToken,
      })
      .returning(PUBLIC_COLUMNS)
      .executeTakeFirstOrThrow();
  },

  async setStatus(
    id: string,
    status: "ativo" | "erro" | "inativo",
    detail: string | null,
    config?: Record<string, string>,
  ) {
    await db
      .updateTable("channel_connections")
      .set({
        status,
        status_detail: detail,
        ...(config && { config: JSON.stringify(config) }),
        updated_at: new Date().toISOString(),
      })
      .where("id", "=", id)
      .execute();
  },

  async setConfig(organizationId: string, id: string, config: Record<string, string>) {
    await db
      .updateTable("channel_connections")
      .set({ config: JSON.stringify(config), updated_at: new Date().toISOString() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .execute();
  },

  async remove(organizationId: string, id: string) {
    const r = await db
      .deleteFrom("channel_connections")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(r.numDeletedRows) > 0;
  },
};

export const templatesRepository = {
  list(organizationId: string, connectionId: string) {
    return db
      .selectFrom("channel_templates")
      .select(["id", "name", "language", "category", "status", "body", "variables", "synced_at"])
      .where("organization_id", "=", organizationId)
      .where("connection_id", "=", connectionId)
      .orderBy("name")
      .execute();
  },

  find(organizationId: string, id: string) {
    return db
      .selectFrom("channel_templates")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  /** Substitui a lista da conexao pelo que a Meta devolveu agora. */
  async replaceAll(
    organizationId: string,
    connectionId: string,
    templates: {
      name: string;
      language: string;
      category: string | null;
      status: string;
      body: string;
      variables: number;
    }[],
  ) {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("channel_templates").where("connection_id", "=", connectionId).execute();
      if (templates.length > 0) {
        await trx
          .insertInto("channel_templates")
          .values(
            templates.map((t) => ({
              ...t,
              organization_id: organizationId,
              connection_id: connectionId,
            })),
          )
          .execute();
      }
    });
  },
};
