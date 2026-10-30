import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import {
  WIDGET_ORIGIN,
  createMaster,
  createTenant,
  startWidgetConversation,
} from "../../test/tenant-fixture.js";

/**
 * Consumo agregado da plataforma: o Master ve contagens de todos os tenants,
 * sem conteudo de conversa; ninguem do tenant acessa a rota.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("consumo agregado da plataforma", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  async function visitorMessage(key: string, conversationId: string, message: string) {
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversationId}/messages`,
      headers: { origin: WIDGET_ORIGIN },
      payload: { key, message },
    });
  }

  it("soma conversas e mensagens por tenant e so o Master acessa", async () => {
    const master = await createMaster(app);
    const a = await createTenant(app, master, "loja-a");
    const b = await createTenant(app, master, "loja-b");

    const first = (await startWidgetConversation(app, a.key)).json();
    await visitorMessage(a.key, first.conversationId, "Segredo do cliente A");
    await visitorMessage(a.key, first.conversationId, "Outra pergunta");
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${first.conversationId}/handoff`,
      headers: { origin: WIDGET_ORIGIN },
      payload: { key: a.key },
    });
    await app.inject({
      method: "POST",
      url: `${a.base}/inbox/${first.conversationId}/messages`,
      headers: { cookie: a.people.Atendente.cookie },
      payload: { content: "Ja vou ver" },
    });
    const second = (await startWidgetConversation(app, b.key)).json();
    await visitorMessage(b.key, second.conversationId, "Oi");

    for (const cookie of [a.admin, a.people.Analista.cookie]) {
      const denied = await app.inject({ method: "GET", url: "/master/usage", headers: { cookie } });
      expect(denied.statusCode).toBe(403);
    }

    const res = await app.inject({
      method: "GET",
      url: "/master/usage?days=7",
      headers: { cookie: master },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("Segredo do cliente A");
    const usage = res.json();

    const ragEvents = await db
      .selectFrom("usage_events")
      .select(["organization_id"])
      .where("type", "=", "rag_query")
      .execute();
    const ragOf = (id: string) => ragEvents.filter((e) => e.organization_id === id).length;

    expect(usage.days).toBe(7);
    expect(usage.totals).toMatchObject({
      activeOrganizations: 2,
      conversations: 2,
      messagesReceived: 3,
      agentReplies: 1,
      ragQueries: ragEvents.length,
    });
    expect(usage.conversationsByChannel).toEqual({ widget: 2 });
    expect(
      usage.messagesReceivedPerDay.reduce((s: number, d: { count: number }) => s + d.count, 0),
    ).toBe(3);

    const rowA = usage.organizations.find(
      (o: { organizationId: string }) => o.organizationId === a.organizationId,
    );
    expect(rowA).toMatchObject({
      conversations: 1,
      messagesReceived: 2,
      agentReplies: 1,
      ragQueries: ragOf(a.organizationId),
    });
    expect(usage.organizations[0].organizationId).toBe(a.organizationId);

    const invalid = await app.inject({
      method: "GET",
      url: "/master/usage?days=365",
      headers: { cookie: master },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
