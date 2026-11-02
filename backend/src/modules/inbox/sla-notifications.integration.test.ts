import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// SMTP simulado: o teste confere quem recebe e que o e-mail nao leva dado do cliente.
const sent = vi.hoisted(() => [] as { to: string; subject: string; text: string }[]);
vi.mock("../../mail/mailer.js", () => ({
  mailer: {
    enabled: () => true,
    send: async (m: { to: string; subject: string; text: string }) => {
      sent.push(m);
      return true;
    },
  },
  panelLink: (path: string) => `https://painel.test${path}`,
}));

const { buildApp } = await import("../../app.js");
const { db } = await import("../../db/client.js");
const { redis } = await import("../../db/redis.js");
const { realtime } = await import("../../realtime/events.js");
const { RUN_INTEGRATION_TESTS, resetDatabase } = await import("../../test/integration-helpers.js");
const fixture = await import("../../test/tenant-fixture.js");
type InboxEvent = import("../../realtime/events.js").InboxEvent;

/**
 * SLA de primeira resposta (prazo na fila e indice no desempenho), eventos
 * de som/aviso do painel e e-mail para quem recebe conversa de outra pessoa.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("SLA e avisos da caixa de entrada", () => {
  let app: FastifyInstance;
  let masterCookie: string;

  beforeEach(async () => {
    sent.length = 0;
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await fixture.createMaster(app);
  });

  afterAll(async () => {
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  async function queued(key: string, externalUserId: string) {
    const started = await fixture.startWidgetConversation(app, key, { externalUserId });
    const conversationId = started.json().conversationId as string;
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversationId}/handoff`,
      headers: { origin: fixture.WIDGET_ORIGIN },
      payload: { key },
    });
    return conversationId;
  }

  it("marca o prazo na fila, mede o SLA e avisa por evento e e-mail", async () => {
    const t = await fixture.createTenant(app, masterCookie, "sla-a");
    const ana = t.people.Atendente;
    const settings = `${t.base}/inbox-settings`;

    expect(
      (await app.inject({ method: "GET", url: settings, headers: { cookie: ana.cookie } })).json(),
    ).toEqual({ firstResponseMinutes: null, emailOnAssignment: false, emailAvailable: true });
    const save = (cookie: string, payload: object) =>
      app.inject({ method: "PUT", url: settings, headers: { cookie }, payload });
    expect(
      (await save(ana.cookie, { firstResponseMinutes: 10, emailOnAssignment: true })).statusCode,
    ).toBe(403);
    expect(
      (await save(t.admin, { firstResponseMinutes: 0, emailOnAssignment: true })).statusCode,
    ).toBe(400);
    expect(
      (await save(t.admin, { firstResponseMinutes: 10, emailOnAssignment: true })).statusCode,
    ).toBe(200);

    const events: InboxEvent[] = [];
    const unsubscribe = await realtime.subscribe(t.organizationId, (e) => events.push(e));
    const late = await queued(t.key, "cliente-atrasado");
    const onTime = await queued(t.key, "cliente-no-prazo");
    // O primeiro pedido foi ha 30 minutos: passou do prazo de 10.
    await db
      .updateTable("conversation_assignments")
      .set({ requested_at: new Date(Date.now() - 30 * 60_000) } as never)
      .where("conversation_id", "=", late)
      .execute();

    const queue = (
      await app.inject({
        method: "GET",
        url: `${t.base}/inbox?view=fila`,
        headers: { cookie: ana.cookie },
      })
    ).json() as { id: string; assignment: { firstResponseLate?: boolean } }[];
    expect(queue.find((c) => c.id === late)?.assignment.firstResponseLate).toBe(true);
    expect(queue.find((c) => c.id === onTime)?.assignment.firstResponseLate).toBe(false);

    // Respondida, a conversa sai do prazo.
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${onTime}/messages`,
      headers: { cookie: ana.cookie },
      payload: { content: "Oi! Ja vou ver." },
    });
    const mine = (
      await app.inject({
        method: "GET",
        url: `${t.base}/inbox?view=minhas`,
        headers: { cookie: ana.cookie },
      })
    ).json() as { id: string; assignment: Record<string, unknown> }[];
    expect(mine.find((c) => c.id === onTime)?.assignment).not.toHaveProperty("firstResponseDueAt");

    // Cliente escreve de novo: aviso para quem esta com a conversa.
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${onTime}/messages`,
      headers: { origin: fixture.WIDGET_ORIGIN },
      payload: { key: t.key, message: "Obrigado" },
    });

    // Desempenho: uma respondida no prazo, uma estourada sem resposta.
    const metrics = await app.inject({
      method: "GET",
      url: `${t.base}/agent-metrics?days=7`,
      headers: { cookie: t.admin },
    });
    expect(metrics.json().team).toMatchObject({
      firstResponseSlaMinutes: 10,
      sla: { met: 1, total: 2 },
    });

    // O administrador passa a atrasada para a Ana: e-mail sem dado do cliente.
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${late}/assign`,
      headers: { cookie: t.admin },
      payload: { userId: ana.userId },
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].to).toBe("atendente@sla-a.local");
    expect(sent[0].text).toContain(`https://painel.test/atendimento?conversa=${late}`);
    expect(sent[0].text).not.toContain("cliente-atrasado");

    // Quem assume para si nao recebe e-mail.
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${late}/assign`,
      headers: { cookie: ana.cookie },
      payload: { userId: ana.userId },
    });
    await new Promise((r) => setTimeout(r, 100));
    unsubscribe();
    expect(sent).toHaveLength(1);

    expect(events.filter((e) => e.kind === "queued").map((e) => e.conversationId)).toEqual([
      late,
      onTime,
    ]);
    expect(events).toContainEqual({
      kind: "visitor_message",
      conversationId: onTime,
      assignedUserId: ana.userId,
    });

    // Desligado, nenhum e-mail.
    await save(t.admin, { firstResponseMinutes: null, emailOnAssignment: false });
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${onTime}/assign`,
      headers: { cookie: t.admin },
      payload: { userId: ana.userId },
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(1);
  });
});
