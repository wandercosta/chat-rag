import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";

/**
 * Custo estimado no consumo da plataforma: tokens gravados em cada resposta
 * vezes o preco do modelo no catalogo (Master). Modelo sem preco nao entra
 * na conta e aparece listado; a parte da chave do tenant (BYOK) fica fora do
 * custo da plataforma.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("custo estimado da plataforma", () => {
  let app: FastifyInstance;
  let masterCookie: string;

  beforeEach(async () => {
    await resetDatabase();
    await db
      .deleteFrom("ai_model_catalog")
      .where("id", "in", ["claude-opus-5-5", "modelo-x"])
      .execute();
    app = await buildApp({ logger: false });
    masterCookie = await createMaster(app);
  });

  afterAll(async () => {
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  async function answer(
    organizationId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    keySource: "tenant" | "plataforma",
  ) {
    await db
      .insertInto("usage_events")
      .values({
        organization_id: organizationId,
        assistant_id: null,
        type: "rag_query",
        payload: JSON.stringify({ latencyMs: 900, model, inputTokens, outputTokens, keySource }),
      })
      .execute();
  }

  it("multiplica tokens pelo preco e separa o que a plataforma paga", async () => {
    const a = await createTenant(app, masterCookie, "custo-a");
    const b = await createTenant(app, masterCookie, "custo-b");
    // A: 1M de entrada + 1M de saida no Claude da plataforma; B: chave propria.
    await answer(a.organizationId, "claude-opus-5-5", 600_000, 200_000, "plataforma");
    await answer(a.organizationId, "claude-opus-5-5", 400_000, 800_000, "plataforma");
    await answer(b.organizationId, "gpt-4o-mini", 2_000_000, 1_000_000, "tenant");
    await answer(b.organizationId, "modelo-x", 1_000, 1_000, "plataforma");

    const price = (cookie: string, model: string, payload: object) =>
      app.inject({
        method: "PUT",
        url: `/master/model-catalog/${model}/price`,
        headers: { cookie },
        payload,
      });
    expect(
      (await price(a.admin, "claude-opus-5-5", { inputPerMTok: 4, outputPerMTok: 20 })).statusCode,
    ).toBe(403);
    expect(
      (await price(masterCookie, "claude-opus-5-5", { inputPerMTok: -1, outputPerMTok: 20 }))
        .statusCode,
    ).toBe(400);
    const claude = await price(masterCookie, "claude-opus-5-5", {
      inputPerMTok: 4,
      outputPerMTok: 20,
    });
    // Modelo fora do catalogo entra desligado: ganha preco sem virar opcao do tenant.
    expect(claude.json()).toMatchObject({ id: "claude-opus-5-5", enabled: false });
    await price(masterCookie, "gpt-4o-mini", { inputPerMTok: 0.15, outputPerMTok: 0.6 });

    const usage = (
      await app.inject({
        method: "GET",
        url: "/master/usage?days=7",
        headers: { cookie: masterCookie },
      })
    ).json();
    // A: 1M x 4 + 1M x 20 = 24 US$. B: 2M x 0,15 + 1M x 0,6 = 0,90 US$ (chave do tenant).
    expect(usage.totals).toMatchObject({
      inputTokens: 3_001_000,
      outputTokens: 2_001_000,
      estimatedCostUsd: 24.9,
      platformCostUsd: 24,
    });
    expect(usage.unpricedModels).toEqual(["modelo-x"]);
    const byOrg = new Map(
      (usage.organizations as { organizationId: string; estimatedCostUsd: number }[]).map((o) => [
        o.organizationId,
        o.estimatedCostUsd,
      ]),
    );
    expect(byOrg.get(a.organizationId)).toBe(24);
    expect(byOrg.get(b.organizationId)).toBeCloseTo(0.9);
  });
});
