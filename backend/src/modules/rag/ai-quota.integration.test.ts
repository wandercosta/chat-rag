import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Modelo simulado da chave da plataforma: cada resposta custa 150 tokens.
const calls = vi.hoisted(() => ({ count: 0 }));
vi.mock("./provider-resolver.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./provider-resolver.js")>();
  return {
    ...original,
    resolveChatProvider: async () => ({
      kind: "llm" as const,
      keySource: "plataforma" as const,
      chat: async () => {
        calls.count += 1;
        return {
          text: "O prazo e de 3 dias uteis [1].",
          usage: { model: "modelo-simulado", inputTokens: 120, outputTokens: 30 },
        };
      },
    }),
  };
});

const { buildApp } = await import("../../app.js");
const { db } = await import("../../db/client.js");
const { redis } = await import("../../db/redis.js");
const { realtime } = await import("../../realtime/events.js");
const { RUN_INTEGRATION_TESTS, resetDatabase } = await import("../../test/integration-helpers.js");
const fixture = await import("../../test/tenant-fixture.js");
const { extractionService, sourcesService } = await import("../knowledge/index.js");
const { indexingService } = await import("./index.js");

/**
 * Limite mensal da IA da plataforma por tenant (ADR-007): o Master define,
 * o tenant ve, e acima do teto a resposta vira extrativa (sem chamar o modelo).
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("limite de IA da plataforma", () => {
  let app: FastifyInstance;
  let masterCookie: string;

  beforeEach(async () => {
    await resetDatabase();
    calls.count = 0;
    app = await buildApp({ logger: false });
    masterCookie = await fixture.createMaster(app);
  });

  afterAll(async () => {
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  async function indexedTenant(slug: string) {
    const t = await fixture.createTenant(app, masterCookie, slug);
    const headers = { cookie: t.admin };
    const topic = (
      await app.inject({
        method: "POST",
        url: `${t.base}/topics`,
        headers,
        payload: { name: "Entregas" },
      })
    ).json();
    const source = (
      await app.inject({
        method: "POST",
        url: `${t.base}/sources`,
        headers,
        payload: {
          topicId: topic.id,
          title: "Politica de entrega",
          kind: "texto",
          content:
            "O prazo de entrega para capitais e de 3 dias uteis apos a confirmacao do pagamento.",
        },
      })
    ).json();
    const { chunks } = await extractionService.extractAndChunk(t.organizationId, source.id);
    const count = await indexingService.embedAndStoreChunks(
      t.organizationId,
      source.id,
      topic.id,
      chunks,
    );
    await sourcesService.markReady(t.organizationId, source.id, count);
    return t;
  }

  const setLimit = (cookie: string, organizationId: string, payload: object) =>
    app.inject({
      method: "PUT",
      url: `/master/tenants/${organizationId}/ai-limit`,
      headers: { cookie },
      payload,
    });

  it("acima do teto responde no modo extrativo e avisa uma vez no mes", async () => {
    const t = await indexedTenant("cota-a");
    const ask = () =>
      app.inject({
        method: "POST",
        url: `${t.base}/assistants/${t.assistantId}/playground-messages`,
        headers: { cookie: t.admin },
        payload: { message: "Qual o prazo de entrega para capitais?" },
      });

    expect((await setLimit(t.admin, t.organizationId, { mode: "sem_limite" })).statusCode).toBe(
      403,
    );
    expect(
      (await setLimit(masterCookie, t.organizationId, { mode: "personalizado" })).statusCode,
    ).toBe(400);
    expect(
      (await setLimit(masterCookie, "00000000-0000-0000-0000-000000000000", { mode: "sem_limite" }))
        .statusCode,
    ).toBe(404);
    const set = await setLimit(masterCookie, t.organizationId, {
      mode: "personalizado",
      tokens: 200,
    });
    expect(set.json()).toMatchObject({ mode: "personalizado", limit: 200, used: 0 });

    // 0 e 150 tokens usados: ainda abaixo de 200, o modelo responde.
    expect((await ask()).json().answer).toBe("O prazo e de 3 dias uteis [1].");
    expect((await ask()).json().answer).toBe("O prazo e de 3 dias uteis [1].");
    expect(calls.count).toBe(2);

    // 300 >= 200: trecho da base com a fonte, sem chamar o modelo.
    const limited = (await ask()).json();
    expect(limited.answer).toContain('Encontrei isto em "Politica de entrega"');
    expect(limited.citations).toHaveLength(1);
    expect(calls.count).toBe(2);
    const last = await db
      .selectFrom("usage_events")
      .select("payload")
      .where("organization_id", "=", t.organizationId)
      .where("type", "=", "rag_query")
      .orderBy("created_at", "desc")
      .executeTakeFirstOrThrow();
    expect(last.payload).toMatchObject({ limitReached: true });
    expect(last.payload).not.toHaveProperty("inputTokens");

    const quota = (
      await app.inject({
        method: "GET",
        url: `${t.base}/ai-quota`,
        headers: { cookie: t.admin },
      })
    ).json();
    expect(quota).toMatchObject({ limit: 200, used: 300, exceeded: true });
    const org = await db
      .selectFrom("organizations")
      .select("ai_limit_notified_month")
      .where("id", "=", t.organizationId)
      .executeTakeFirstOrThrow();
    expect(org.ai_limit_notified_month).toBe(new Date().toISOString().slice(0, 7));

    // Sem limite explicito: o modelo volta a responder.
    await setLimit(masterCookie, t.organizationId, { mode: "sem_limite" });
    expect((await ask()).json().answer).toBe("O prazo e de 3 dias uteis [1].");
    expect(calls.count).toBe(3);
  });

  it("chave do tenant nao conta no teto", async () => {
    const t = await fixture.createTenant(app, masterCookie, "cota-b");
    await db
      .insertInto("usage_events")
      .values({
        organization_id: t.organizationId,
        assistant_id: null,
        type: "rag_query",
        payload: JSON.stringify({
          model: "gpt-4o-mini",
          inputTokens: 900,
          outputTokens: 100,
          keySource: "tenant",
        }),
      })
      .execute();
    await setLimit(masterCookie, t.organizationId, { mode: "personalizado", tokens: 500 });
    const quota = (
      await app.inject({
        method: "GET",
        url: `/master/tenants/${t.organizationId}/ai-quota`,
        headers: { cookie: masterCookie },
      })
    ).json();
    expect(quota).toMatchObject({ used: 0, limit: 500, exceeded: false });
  });
});
