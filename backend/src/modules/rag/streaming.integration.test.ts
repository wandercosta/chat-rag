import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Modelo simulado que responde em pedacos. "sem base" no texto da pergunta
// faz ele responder a marca de "sem resposta na base", tambem em pedacos.
const NO_ANSWER = vi.hoisted(() => "__SEM_RESPOSTA_NA_BASE__");
vi.mock("./provider-resolver.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./provider-resolver.js")>();
  const pieces = (question: string) =>
    question.includes("sem base")
      ? [NO_ANSWER.slice(0, 6), NO_ANSWER.slice(6)]
      : ["O prazo ", "e de 3 dias ", "uteis [1]."];
  return {
    ...original,
    resolveChatProvider: async () => ({
      kind: "llm" as const,
      chat: async (messages: { content: string }[]) => ({
        text: pieces(messages.at(-1)!.content).join(""),
        usage: { model: "modelo-simulado", inputTokens: 120, outputTokens: 30 },
      }),
      stream: async (
        messages: { content: string }[],
        _model: string,
        onDelta: (t: string) => void,
      ) => {
        const parts = pieces(messages.at(-1)!.content);
        parts.forEach(onDelta);
        return {
          text: parts.join(""),
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

type StreamEvent = { type: string; text?: string; answer?: string; citations?: unknown[] };

/** Corpo SSE ("data: {...}" por evento) em lista de eventos. */
function events(body: string): StreamEvent[] {
  return body
    .split("\n\n")
    .filter((block) => block.startsWith("data: "))
    .map((block) => JSON.parse(block.slice("data: ".length)));
}

/**
 * Resposta em streaming (Accept: text/event-stream) no playground e no
 * widget: pedacos enquanto o modelo escreve e a resposta final no "done".
 * A marca de "sem resposta na base" nunca sai como pedaco.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("resposta em streaming", () => {
  let app: FastifyInstance;
  let masterCookie: string;

  beforeEach(async () => {
    await resetDatabase();
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

  it("playground: pedacos e resposta final com fontes", async () => {
    const t = await indexedTenant("str-a");
    const url = `${t.base}/assistants/${t.assistantId}/playground-messages`;
    const streamed = await app.inject({
      method: "POST",
      url,
      headers: { cookie: t.admin, accept: "text/event-stream" },
      payload: { message: "Qual o prazo de entrega para capitais?" },
    });
    expect(streamed.headers["content-type"]).toContain("text/event-stream");
    const list = events(streamed.body);
    const deltas = list.filter((e) => e.type === "delta").map((e) => e.text);
    expect(deltas).toEqual(["O prazo ", "e de 3 dias ", "uteis [1]."]);
    const done = list.at(-1)!;
    expect(done).toMatchObject({ type: "done", answer: "O prazo e de 3 dias uteis [1]." });
    expect(done.citations).toHaveLength(1);

    // Sem o cabecalho, a mesma rota responde JSON como antes.
    const plain = await app.inject({
      method: "POST",
      url,
      headers: { cookie: t.admin },
      payload: { message: "Qual o prazo de entrega para capitais?" },
    });
    // O consumo da resposta (tokens e modelo) fica no evento, para o custo estimado.
    const event = await db
      .selectFrom("usage_events")
      .select("payload")
      .where("organization_id", "=", t.organizationId)
      .where("type", "=", "rag_query")
      .executeTakeFirstOrThrow();
    expect(event.payload).toMatchObject({
      model: "modelo-simulado",
      inputTokens: 120,
      outputTokens: 30,
      keySource: "plataforma",
    });
    expect(plain.json()).toMatchObject({
      answer: "O prazo e de 3 dias uteis [1].",
      usedContext: true,
    });
  });

  it("widget: a marca de sem resposta nunca sai como pedaco", async () => {
    const t = await indexedTenant("str-b");
    const conversationId = (await fixture.startWidgetConversation(app, t.key)).json()
      .conversationId as string;
    const ask = (message: string) =>
      app.inject({
        method: "POST",
        url: `/widget/conversations/${conversationId}/messages`,
        headers: { origin: fixture.WIDGET_ORIGIN, accept: "text/event-stream" },
        payload: { key: t.key, message },
      });

    const answered = events((await ask("Qual o prazo de entrega para capitais?")).body);
    expect(answered.filter((e) => e.type === "delta").length).toBeGreaterThan(0);
    expect(answered.at(-1)).toMatchObject({ type: "done", humanHandling: false });

    const noBase = (await ask("Qual o prazo de entrega para capitais sem base?")).body;
    expect(noBase).not.toContain(NO_ANSWER);
    const list = events(noBase);
    expect(list.filter((e) => e.type === "delta")).toEqual([]);
    expect(list.at(-1)?.type).toBe("done");
    expect(list.at(-1)?.answer).toBeTruthy();
  });
});
