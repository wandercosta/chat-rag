import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { webhooksQueue } from "../../queue/webhooks.queue.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import {
  WIDGET_ORIGIN,
  createMaster,
  createTenant,
  startWidgetConversation,
} from "../../test/tenant-fixture.js";
import { isPrivateAddress, processWebhookDelivery } from "../webhooks/index.js";

type Received = { headers: http.IncomingHttpHeaders; body: string };

/**
 * Etapa 8 (ADR-006): API publica com token (escopo, revogacao, limite por
 * minuto, isolamento por tenant), webhooks assinados com novas tentativas e
 * metricas por atendente.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("API publica, webhooks e metricas", () => {
  let app: FastifyInstance;
  let receiver: http.Server;
  let receiverUrl = "";
  let received: Received[] = [];
  let failNext = 0;

  beforeAll(async () => {
    receiver = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.statusCode = failNext-- > 0 ? 500 : 204;
        res.end();
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;
  });

  beforeEach(async () => {
    await resetDatabase();
    for (const key of await redis.keys("api-rate:*")) await redis.del(key);
    await webhooksQueue.obliterate({ force: true });
    received = [];
    failNext = 0;
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    receiver.close();
    await webhooksQueue.close();
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  /** Faz o papel do worker: entrega tudo o que esta pendente. */
  async function deliverPending(attempt = 1) {
    const pending = await db
      .selectFrom("webhook_deliveries")
      .select("id")
      .where("status", "=", "pendente")
      .execute();
    for (const d of pending) await processWebhookDelivery(d.id, attempt).catch(() => undefined);
  }

  it("token com escopo le e cria contatos so do proprio tenant, e revogado para de valer", async () => {
    const master = await createMaster(app);
    const t = await createTenant(app, master, "loja-api");
    const other = await createTenant(app, master, "outra-api");
    await app.inject({
      method: "POST",
      url: `${other.base}/contacts`,
      headers: { cookie: other.admin },
      payload: { name: "De outro tenant", email: "outro@x.com" },
    });

    const created = await app.inject({
      method: "POST",
      url: `${t.base}/api-tokens`,
      headers: { cookie: t.admin },
      payload: { name: "ERP", scopes: ["contacts:read", "contacts:write"] },
    });
    expect(created.statusCode).toBe(201);
    const { token, id } = created.json();
    expect(token).toMatch(/^crg_/);
    const listed = await app.inject({
      method: "GET",
      url: `${t.base}/api-tokens`,
      headers: { cookie: t.admin },
    });
    expect(listed.body).not.toContain(token);

    // Atendente nao gerencia tokens.
    const denied = await app.inject({
      method: "GET",
      url: `${t.base}/api-tokens`,
      headers: { cookie: t.people.Atendente.cookie },
    });
    expect(denied.statusCode).toBe(403);

    const auth = { authorization: `Bearer ${token}` };
    const newContact = await app.inject({
      method: "POST",
      url: "/api/v1/contacts",
      headers: auth,
      payload: { name: "Cliente API", email: "Cliente@API.com", optIn: true },
    });
    expect(newContact.statusCode).toBe(201);
    expect(newContact.json()).toMatchObject({ email: "cliente@api.com", optIn: true });

    const list = await app.inject({ method: "GET", url: "/api/v1/contacts", headers: auth });
    expect(list.json().items.map((c: { email: string }) => c.email)).toEqual(["cliente@api.com"]);

    const otherContact = await db
      .selectFrom("contacts")
      .select("id")
      .where("organization_id", "=", other.organizationId)
      .executeTakeFirstOrThrow();
    const crossTenant = await app.inject({
      method: "GET",
      url: `/api/v1/contacts/${otherContact.id}`,
      headers: auth,
    });
    expect(crossTenant.statusCode).toBe(404);

    const noScope = await app.inject({
      method: "GET",
      url: "/api/v1/conversations",
      headers: auth,
    });
    expect(noScope.statusCode).toBe(403);

    await app.inject({
      method: "DELETE",
      url: `${t.base}/api-tokens/${id}`,
      headers: { cookie: t.admin },
    });
    const revoked = await app.inject({ method: "GET", url: "/api/v1/contacts", headers: auth });
    expect(revoked.statusCode).toBe(401);
  });

  it("limita chamadas por minuto por token", async () => {
    const master = await createMaster(app);
    const t = await createTenant(app, master, "loja-rate");
    const { token } = (
      await app.inject({
        method: "POST",
        url: `${t.base}/api-tokens`,
        headers: { cookie: t.admin },
        payload: { name: "Script", scopes: ["conversations:read"] },
      })
    ).json();
    const auth = { authorization: `Bearer ${token}` };
    let last = 0;
    for (let i = 0; i < 121; i++) {
      last = (await app.inject({ method: "GET", url: "/api/v1/conversations", headers: auth }))
        .statusCode;
    }
    expect(last).toBe(429);
  });

  it("entrega eventos assinados, tenta de novo quando falha e recusa rede interna", async () => {
    const master = await createMaster(app);
    const t = await createTenant(app, master, "loja-hook");

    const hook = await app.inject({
      method: "POST",
      url: `${t.base}/webhooks`,
      headers: { cookie: t.admin },
      payload: {
        url: receiverUrl,
        events: ["mensagem.recebida", "conversa.resolvida", "contato.criado"],
      },
    });
    expect(hook.statusCode).toBe(201);
    const { secret, id: webhookId } = hook.json();
    expect(secret).toMatch(/^whsec_/);

    // Contato criado pelo painel e mensagem do visitante.
    await app.inject({
      method: "POST",
      url: `${t.base}/contacts`,
      headers: { cookie: t.admin },
      payload: { name: "Ana", email: "ana@x.com" },
    });
    const conversation = (await startWidgetConversation(app, t.key)).json();
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversation.conversationId}/messages`,
      headers: { origin: WIDGET_ORIGIN },
      payload: { key: t.key, message: "Oi, preciso de ajuda" },
    });

    failNext = 1; // a primeira entrega falha e fica pendente para nova tentativa
    await deliverPending(1);
    await deliverPending(2);

    const events = received.filter((r) => r.headers["x-chatrag-event"] !== undefined);
    const message = events.find((r) => r.headers["x-chatrag-event"] === "mensagem.recebida")!;
    expect(JSON.parse(message.body).data).toMatchObject({
      conversationId: conversation.conversationId,
      content: "Oi, preciso de ajuda",
      channel: "widget",
    });
    const [t1, v1] = String(message.headers["x-chatrag-signature"])
      .split(",")
      .map((part) => part.split("=")[1]);
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${t1}.${message.body}`)
      .digest("hex");
    expect(v1).toBe(expected);
    expect(events.some((r) => r.headers["x-chatrag-event"] === "contato.criado")).toBe(true);

    const deliveries = (
      await app.inject({
        method: "GET",
        url: `${t.base}/webhooks/${webhookId}/deliveries`,
        headers: { cookie: t.admin },
      })
    ).json();
    expect(deliveries.every((d: { status: string }) => d.status === "entregue")).toBe(true);
    expect(deliveries.some((d: { attempts: number }) => d.attempts === 2)).toBe(true);

    // Resolver a conversa gera o evento.
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversation.conversationId}/handoff`,
      headers: { origin: WIDGET_ORIGIN },
      payload: { key: t.key },
    });
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversation.conversationId}/status`,
      headers: { cookie: t.admin },
      payload: { status: "resolvida" },
    });
    await deliverPending();
    expect(received.some((r) => r.headers["x-chatrag-event"] === "conversa.resolvida")).toBe(true);

    // Guarda de SSRF (fora do modo de teste so https publico).
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    const ftp = await app.inject({
      method: "POST",
      url: `${t.base}/webhooks`,
      headers: { cookie: t.admin },
      payload: { url: "ftp://x.com/hook", events: ["contato.criado"] },
    });
    expect(ftp.statusCode).toBe(422);
    expect(
      JSON.stringify(await db.selectFrom("webhook_endpoints").select("url").execute()),
    ).not.toContain(secret);
  });

  it("mede primeira resposta, resolvidas e mensagens por atendente", async () => {
    const master = await createMaster(app);
    const t = await createTenant(app, master, "loja-metricas");
    const agent = t.people.Atendente;
    const conversation = (await startWidgetConversation(app, t.key)).json();
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversation.conversationId}/handoff`,
      headers: { origin: WIDGET_ORIGIN },
      payload: { key: t.key },
    });
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversation.conversationId}/messages`,
      headers: { cookie: agent.cookie },
      payload: { content: "Ola! Ja vou ver isso." },
    });
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversation.conversationId}/status`,
      headers: { cookie: agent.cookie },
      payload: { status: "resolvida" },
    });

    const forbidden = await app.inject({
      method: "GET",
      url: `${t.base}/agent-metrics`,
      headers: { cookie: agent.cookie },
    });
    expect(forbidden.statusCode).toBe(403);

    const metrics = (
      await app.inject({
        method: "GET",
        url: `${t.base}/agent-metrics?days=7`,
        headers: { cookie: t.admin },
      })
    ).json();
    const row = metrics.agents.find((a: { userId: string }) => a.userId === agent.userId);
    expect(row).toMatchObject({ assigned: 1, resolved: 1, messagesSent: 1 });
    expect(row.firstResponseMedianSeconds).toBeGreaterThanOrEqual(0);
    expect(metrics.team).toMatchObject({ requests: 1, resolved: 1 });
  });
});
