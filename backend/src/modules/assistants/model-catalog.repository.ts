import { db } from "../../db/client.js";

export const modelCatalogRepository = {
  listEnabled() {
    return db.selectFrom("ai_model_catalog").selectAll().where("enabled", "=", true).execute();
  },

  listAll() {
    return db.selectFrom("ai_model_catalog").selectAll().orderBy("id").execute();
  },

  findById(id: string) {
    return db.selectFrom("ai_model_catalog").selectAll().where("id", "=", id).executeTakeFirst();
  },

  upsert(id: string, label: string, note: string | null) {
    return db
      .insertInto("ai_model_catalog")
      .values({ id, label, note, enabled: true })
      .onConflict((oc) => oc.column("id").doUpdateSet({ label, note }))
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /**
   * Preco por modelo (US$ por 1M tokens). Modelo que nao esta no catalogo
   * (ex.: o Claude do .env) entra desligado: ganha preco sem aparecer para
   * os tenants escolherem.
   */
  async setPrice(id: string, input: number | null, output: number | null) {
    return db
      .insertInto("ai_model_catalog")
      .values({
        id,
        label: id,
        note: null,
        enabled: false,
        input_price_per_mtok: input,
        output_price_per_mtok: output,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({ input_price_per_mtok: input, output_price_per_mtok: output }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async prices() {
    const rows = await db
      .selectFrom("ai_model_catalog")
      .select(["id", "input_price_per_mtok", "output_price_per_mtok"])
      .execute();
    return new Map(
      rows
        .filter((r) => r.input_price_per_mtok !== null && r.output_price_per_mtok !== null)
        .map((r) => [
          r.id,
          { input: Number(r.input_price_per_mtok), output: Number(r.output_price_per_mtok) },
        ]),
    );
  },

  setEnabled(id: string, enabled: boolean) {
    return db.updateTable("ai_model_catalog").set({ enabled }).where("id", "=", id).execute();
  },

  /** Uma linha em `tenant_allowed_models` significa restricao explicita do
   * Master. Sem nenhuma, valem os modelos ativos do catalogo (ADR-004) — senao
   * um tenant recem-criado nasceria sem poder criar assistente nenhum. */
  async hasExplicitAllowList(organizationId: string): Promise<boolean> {
    const row = await db
      .selectFrom("tenant_allowed_models")
      .select("model_id")
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();
    return Boolean(row);
  },

  async listAllowedForTenant(organizationId: string) {
    if (!(await this.hasExplicitAllowList(organizationId))) {
      const enabled = await this.listEnabled();
      return enabled.map((m) => ({ id: m.id, label: m.label, note: m.note }));
    }

    return db
      .selectFrom("tenant_allowed_models as tam")
      .innerJoin("ai_model_catalog as c", "c.id", "tam.model_id")
      .select(["c.id", "c.label", "c.note"])
      .where("tam.organization_id", "=", organizationId)
      .where("c.enabled", "=", true)
      .execute();
  },

  async replaceAllowedForTenant(organizationId: string, modelIds: string[]) {
    await db
      .deleteFrom("tenant_allowed_models")
      .where("organization_id", "=", organizationId)
      .execute();
    if (modelIds.length === 0) return;
    await db
      .insertInto("tenant_allowed_models")
      .values(modelIds.map((modelId) => ({ organization_id: organizationId, model_id: modelId })))
      .execute();
  },

  async isAllowedForTenant(organizationId: string, modelId: string): Promise<boolean> {
    // Sem lista explicita, o limite e o catalogo ativo — nao "nada liberado"
    // (ADR-004). Um modelo desativado no catalogo nunca passa, nos dois casos.
    if (!(await this.hasExplicitAllowList(organizationId))) {
      const model = await this.findById(modelId);
      return Boolean(model?.enabled);
    }

    const row = await db
      .selectFrom("tenant_allowed_models")
      .select("model_id")
      .where("organization_id", "=", organizationId)
      .where("model_id", "=", modelId)
      .executeTakeFirst();
    return Boolean(row);
  },
};
