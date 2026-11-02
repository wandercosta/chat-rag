import { db } from "../../db/client.js";

export interface VisitorProfileInput {
  externalUserId?: string;
  name?: string;
  email?: string;
  context?: Record<string, unknown>;
  /** Veio de um token de identidade assinado (widget). */
  verified?: boolean;
}

export const visitorsRepository = {
  findByExternalId(organizationId: string, externalUserId: string) {
    return db
      .selectFrom("visitors")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("external_user_id", "=", externalUserId)
      .executeTakeFirst();
  },

  findById(id: string) {
    return db.selectFrom("visitors").selectAll().where("id", "=", id).executeTakeFirst();
  },

  create(organizationId: string, input: VisitorProfileInput) {
    return db
      .insertInto("visitors")
      .values({
        organization_id: organizationId,
        external_user_id: input.externalUserId ?? null,
        name: input.name ?? null,
        email: input.email ?? null,
        context: input.context ? JSON.stringify(input.context) : null,
        identity_verified: input.verified ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** So sobrescreve campos enviados de novo; um dado de contexto ja preenchido
   * numa visita anterior nao some so porque a visita seguinte nao o repetiu. */
  updateProfile(id: string, input: VisitorProfileInput) {
    return db
      .updateTable("visitors")
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.context !== undefined ? { context: JSON.stringify(input.context) } : {}),
        ...(input.verified ? { identity_verified: true } : {}),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
