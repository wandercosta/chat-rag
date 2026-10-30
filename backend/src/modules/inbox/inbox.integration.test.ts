import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime, type InboxEvent } from "../../realtime/events.js";
import { identityService } from "../identity/index.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";

const ORIGIN = "https://loja.test";

function cookieFrom(response: { cookies: Array<{ name: string; value: string }> }) {
  return response.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Caixa de entrada (ADR-006, etapa 2): pedido de atendente no widget, IA
 * calada enquanto ha humano, resposta do atendente chegando ao widget, notas
 * que nunca saem do painel, permissoes por papel e isolamento entre tenants.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("caixa de entrada", () => {
  let app: FastifyInstance;
  let masterCookie: string;

  async function login(email: string, password: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    return cookieFrom(res);
  }

  /** Tenant com assistente (caixa de entrada ligada), chave de widget e as
   * pessoas de cada papel. */
  async function createTenant(slug: string) {
    const tenant = await app.inject({
      method: "POST",
      url: "/master/tenants",
      headers: { cookie: masterCookie },
      payload: {
        name: `Loja ${slug}`,
        slug,
        adminEmail: `admin@${slug}.local`,
        adminPassword: "senha-admin-123",
      },
    });
    const organizationId: string = tenant.json().organization.id;
    const admin = await login(`admin@${slug}.local`, "senha-admin-123");

    const base = `/organizations/${organizationId}`;
    const assistant = await app.inject({
      method: "POST",
      url: `${base}/assistants`,
      headers: { cookie: admin },
      payload: { name: "Assistente", modelId: "gpt-4o-mini" },
    });
    const assistantId: string = assistant.json().id;
    await app.inject({
      method: "PATCH",
      url: `${base}/assistants/${assistantId}`,
      headers: { cookie: admin },
      payload: { humanInboxEnabled: true },
    });

    const key = await app.inject({
      method: "POST",
      url: `${base}/widget-keys`,
      headers: { cookie: admin },
      payload: { assistantId, environment: "producao", domains: ["loja.test"] },
    });

    const people: Record<string, { cookie: string; userId: string }> = {};
    for (const role of ["Atendente", "Analista"] as const) {
      const email = `${role.toLowerCase()}@${slug}.local`;
      const member = await app.inject({
        method: "POST",
        url: `${base}/members`,
        headers: { cookie: admin },
        payload: { email, password: "senha-membro-123", role },
      });
      people[role] = {
        cookie: await login(email, "senha-membro-123"),
        userId: member.json().user_id,
      };
    }

    return { organizationId, base, admin, key: key.json().plaintext as string, people };
  }

  function startWidget(key: string, externalUserId = "cliente-1") {
    return app.inject({
      method: "POST",
      url: "/widget/conversations",
      headers: { origin: ORIGIN },
      payload: { key, externalUserId, visitorName: "Maria" },
    });
  }

  async function widgetConversation(key: string) {
    return (await startWidget(key)).json().conversationId as string;
  }

  function widgetMessage(key: string, conversationId: string, message: string) {
    return app.inject({
      method: "POST",
      url: `/widget/conversations/${conversationId}/messages`,
      headers: { origin: ORIGIN },
      payload: { key, message },
    });
  }

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp({ logger: false });
    const master = await identityService.createUser(db, "master@teste.local", "senha-master-123");
    await db.insertInto("platform_roles").values({ user_id: master.id }).execute();
    masterCookie = await login("master@teste.local", "senha-master-123");
  });

  afterAll(async () => {
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  it("pede atendente, cala a IA, entrega a resposta humana e esconde a nota", async () => {
    const t = await createTenant("loja-a");
    const atendente = t.people.Atendente;
    const conversationId = await widgetConversation(t.key);

    const handoff = await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversationId}/handoff`,
      headers: { origin: ORIGIN },
      payload: { key: t.key },
    });
    expect(handoff.json()).toEqual({ inbox: true, status: "aberta" });

    const queue = await app.inject({
      method: "GET",
      url: `${t.base}/inbox?view=fila`,
      headers: { cookie: atendente.cookie },
    });
    expect(queue.json().map((c: { id: string }) => c.id)).toEqual([conversationId]);

    // Com humano na conversa, o assistente nao responde.
    const silent = await widgetMessage(t.key, conversationId, "Quero falar sobre meu pedido");
    expect(silent.json()).toEqual({ answer: null, citations: [], humanHandling: true });

    const events: InboxEvent[] = [];
    const unsubscribe = await realtime.subscribe(t.organizationId, (e) => events.push(e));

    const reply = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/messages`,
      headers: { cookie: atendente.cookie },
      payload: { content: "Oi Maria, sou a atendente." },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({ role: "atendente", author_user_id: atendente.userId });

    const note = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/notes`,
      headers: { cookie: atendente.cookie },
      payload: { content: "cliente VIP, nao contar ao visitante" },
    });
    expect(note.statusCode).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await unsubscribe();
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "agent_message", content: "Oi Maria, sou a atendente." }),
    );
    expect(JSON.stringify(events)).not.toContain("VIP");

    // Quem assumiu foi a atendente: outra pessoa nao responde por cima.
    const overlap = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/messages`,
      headers: { cookie: t.admin },
      payload: { content: "resposta duplicada" },
    });
    expect(overlap.statusCode).toBe(409);

    // O widget retoma a conversa com a resposta humana e sem a nota.
    const resumed = (await startWidget(t.key)).json();
    expect(resumed.conversationId).toBe(conversationId);
    expect(resumed.messages).toContainEqual(
      expect.objectContaining({ role: "atendente", content: "Oi Maria, sou a atendente." }),
    );
    expect(JSON.stringify(resumed)).not.toContain("VIP");
    const detail = await app.inject({
      method: "GET",
      url: `${t.base}/inbox/${conversationId}`,
      headers: { cookie: atendente.cookie },
    });
    expect(detail.json().notes).toHaveLength(1);
    expect(detail.json().assignment).toMatchObject({
      status: "aberta",
      assignedUserEmail: "atendente@loja-a.local",
    });

    // Resolvida, a conversa volta para o assistente.
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/status`,
      headers: { cookie: atendente.cookie },
      payload: { status: "resolvida" },
    });
    const back = await widgetMessage(t.key, conversationId, "Qual o horario?");
    expect(back.json()).toMatchObject({ humanHandling: false });
    expect(back.json().answer).toEqual(expect.any(String));
  });

  it("aplica as permissoes de cada papel", async () => {
    const t = await createTenant("loja-b");
    const conversationId = await widgetConversation(t.key);

    const analystReply = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/messages`,
      headers: { cookie: t.people.Analista.cookie },
      payload: { content: "oi" },
    });
    expect(analystReply.statusCode).toBe(403);

    // Atendente assume para si, mas nao atribui a outra pessoa.
    const toOther = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/assign`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { userId: t.people.Analista.userId },
    });
    expect(toOther.statusCode).toBe(403);

    // Analista nao atende: nem o administrador atribui a ele.
    const toAnalyst = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/assign`,
      headers: { cookie: t.admin },
      payload: { userId: t.people.Analista.userId },
    });
    expect(toAnalyst.statusCode).toBe(422);

    const self = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/assign`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { userId: t.people.Atendente.userId },
    });
    expect(self.statusCode).toBe(200);

    const mine = await app.inject({
      method: "GET",
      url: `${t.base}/inbox?view=minhas`,
      headers: { cookie: t.people.Atendente.cookie },
    });
    expect(mine.json()).toHaveLength(1);
  });

  it("nao deixa um tenant ver nem responder conversa de outro", async () => {
    const a = await createTenant("loja-c");
    const b = await createTenant("loja-d");
    const conversationA = await widgetConversation(a.key);

    const crossList = await app.inject({
      method: "GET",
      url: `${a.base}/inbox?view=assistente`,
      headers: { cookie: b.admin },
    });
    expect(crossList.statusCode).toBe(403);

    // Pela rota do proprio tenant B, a conversa de A nao existe.
    const viaOwnTenant = await app.inject({
      method: "POST",
      url: `${b.base}/inbox/${conversationA}/messages`,
      headers: { cookie: b.admin },
      payload: { content: "invasao" },
    });
    expect(viaOwnTenant.statusCode).toBe(404);

    const detail = await app.inject({
      method: "GET",
      url: `${b.base}/inbox/${conversationA}`,
      headers: { cookie: b.admin },
    });
    expect(detail.statusCode).toBe(404);
  });

  it("entrega a resposta do atendente ao widget por SSE", async () => {
    const t = await createTenant("loja-e");
    const conversationId = await widgetConversation(t.key);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const controller = new AbortController();
    const response = await fetch(
      `http://127.0.0.1:${port}/widget/conversations/${conversationId}/events?key=${encodeURIComponent(t.key)}`,
      { headers: { origin: ORIGIN }, signal: controller.signal },
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read(); // ": conectado"

    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/notes`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { content: "nota secreta" },
    });
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/messages`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { content: "Ola pelo painel" },
    });

    let received = "";
    while (!received.includes("Ola pelo painel")) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value);
    }
    controller.abort();
    await app.close();

    expect(received).toContain('"kind":"agent_message"');
    expect(received).not.toContain("nota secreta");
  });
});
