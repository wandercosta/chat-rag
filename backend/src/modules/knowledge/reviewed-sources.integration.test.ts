import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";
import { indexingService } from "../rag/index.js";
import { extractionService, sourcesService } from "./index.js";

/**
 * Revisao de fonte por assistente: com "so fontes revisadas", o assistente
 * ignora a fonte pronta mas nao revisada e passa a usa-la quando alguem marca
 * como revisada. Aprovar uma fonte em revisao tambem conta como revisada.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("fontes revisadas por assistente", () => {
  let app: FastifyInstance;
  let masterCookie: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await createMaster(app);
  });

  afterAll(async () => {
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  it("so responde com fonte revisada quando o assistente pede", async () => {
    const t = await createTenant(app, masterCookie, "rev-a");
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

    const ask = async () =>
      (
        await app.inject({
          method: "POST",
          url: `${t.base}/assistants/${t.assistantId}/playground-messages`,
          headers,
          payload: { message: "Qual o prazo de entrega para capitais?" },
        })
      ).json() as { usedContext: boolean };
    expect((await ask()).usedContext).toBe(true);

    await app.inject({
      method: "PATCH",
      url: `${t.base}/assistants/${t.assistantId}`,
      headers,
      payload: { reviewedSourcesOnly: true },
    });
    expect((await ask()).usedContext).toBe(false);

    const review = (reviewed: boolean, cookie = t.admin) =>
      app.inject({
        method: "POST",
        url: `${t.base}/sources/${source.id}/review`,
        headers: { cookie },
        payload: { reviewed },
      });
    expect((await review(true, t.people.Analista.cookie)).statusCode).toBe(403);
    const marked = await review(true);
    expect(marked.statusCode).toBe(200);
    expect(marked.json().reviewed_at).toBeTruthy();
    expect((await ask()).usedContext).toBe(true);

    await review(false);
    expect((await ask()).usedContext).toBe(false);

    const audit = await db
      .selectFrom("audit_events")
      .select("action")
      .where("organization_id", "=", t.organizationId)
      .where("action", "like", "%revis%")
      .execute();
    expect(audit.map((a) => a.action)).toEqual([
      "Marcou fonte como revisada",
      "Tirou a revisao da fonte",
    ]);
  });

  it("aprovar fonte da colecao com revisao marca como revisada", async () => {
    const t = await createTenant(app, masterCookie, "rev-b");
    const headers = { cookie: t.admin };
    const collection = (
      await app.inject({
        method: "POST",
        url: `${t.base}/collections`,
        headers,
        payload: { name: "Juridico", requiresReview: true },
      })
    ).json();
    const topic = (
      await app.inject({
        method: "POST",
        url: `${t.base}/topics`,
        headers,
        payload: { name: "Contratos", collectionId: collection.id },
      })
    ).json();
    const source = (
      await app.inject({
        method: "POST",
        url: `${t.base}/sources`,
        headers,
        payload: {
          topicId: topic.id,
          title: "Contrato",
          kind: "texto",
          content: "Clausula unica.",
        },
      })
    ).json();
    expect(source.status).toBe("aguardando_revisao");
    // Fonte em revisao so sai pela aprovacao, nao pela marcacao avulsa.
    expect(
      (
        await app.inject({
          method: "POST",
          url: `${t.base}/sources/${source.id}/review`,
          headers,
          payload: { reviewed: true },
        })
      ).statusCode,
    ).toBe(409);
    const approved = await app.inject({
      method: "POST",
      url: `${t.base}/sources/${source.id}/approve`,
      headers,
    });
    expect(approved.json().reviewed_by).toBeTruthy();
  });
});
