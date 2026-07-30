import { db } from "../../db/client.js";
import type { CredentialEnvironment, CredentialStatus } from "../../db/types.js";
import type { Envelope } from "./ai-credentials.envelope.js";

export interface UpsertCredentialInput {
  organizationId: string;
  environment: CredentialEnvironment;
  status: CredentialStatus;
  masked: string;
  envelope: Envelope;
}

export const aiCredentialsRepository = {
  findByOrganization(organizationId: string) {
    return db
      .selectFrom("tenant_ai_credentials")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();
  },

  findEffective(organizationId: string, environment: "teste" | "producao") {
    return db
      .selectFrom("tenant_ai_credentials")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where((eb) => eb.or([eb("environment", "=", environment), eb("environment", "=", "ambos")]))
      .executeTakeFirst();
  },

  /** Ao configurar 'ambos', remove linhas individuais de teste/producao (e vice-versa),
   * para nunca ter duas fontes de verdade conflitantes para o mesmo ambiente. */
  async replaceForEnvironment(trxDb: typeof db, input: UpsertCredentialInput) {
    const conflicting =
      input.environment === "ambos" ? (["teste", "producao"] as const) : (["ambos"] as const);

    await trxDb
      .deleteFrom("tenant_ai_credentials")
      .where("organization_id", "=", input.organizationId)
      .where("environment", "in", conflicting)
      .execute();

    return trxDb
      .insertInto("tenant_ai_credentials")
      .values({
        organization_id: input.organizationId,
        environment: input.environment,
        status: input.status,
        masked: input.masked,
        ciphertext: input.envelope.ciphertext,
        iv: input.envelope.iv,
        auth_tag: input.envelope.authTag,
        wrapped_dek: input.envelope.wrappedDek,
        dek_iv: input.envelope.dekIv,
        dek_auth_tag: input.envelope.dekAuthTag,
        kek_version: input.envelope.kekVersion,
        updated_at: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.columns(["organization_id", "environment"]).doUpdateSet((eb) => ({
          status: eb.ref("excluded.status"),
          masked: eb.ref("excluded.masked"),
          ciphertext: eb.ref("excluded.ciphertext"),
          iv: eb.ref("excluded.iv"),
          auth_tag: eb.ref("excluded.auth_tag"),
          wrapped_dek: eb.ref("excluded.wrapped_dek"),
          dek_iv: eb.ref("excluded.dek_iv"),
          dek_auth_tag: eb.ref("excluded.dek_auth_tag"),
          kek_version: eb.ref("excluded.kek_version"),
          updated_at: eb.ref("excluded.updated_at"),
        })),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  markRemoved(organizationId: string, environment: CredentialEnvironment) {
    return db
      .updateTable("tenant_ai_credentials")
      .set({ status: "removida", updated_at: new Date().toISOString() })
      .where("organization_id", "=", organizationId)
      .where("environment", "=", environment)
      .execute();
  },
};
