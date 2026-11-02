import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Storage em memoria: o teste confere que o anexo some junto.
const files = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("../../storage/objects.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../storage/objects.js")>()),
  putSourceFile: async (key: string, body: Buffer) => void files.set(key, body),
  getSourceFile: async (key: string) => files.get(key)!,
  deleteObjects: async (keys: string[]) => keys.forEach((k) => files.delete(k)),
}));

const { buildApp } = await import("../../app.js");
const { db } = await import("../../db/client.js");
const { redis } = await import("../../db/redis.js");
const { realtime } = await import("../../realtime/events.js");
const { RUN_INTEGRATION_TESTS, resetDatabase } = await import("../../test/integration-helpers.js");
const fixture = await import("../../test/tenant-fixture.js");
const { attachmentsService, retentionService } = await import("./index.js");
const { inboxService } = await import("../inbox/index.js");

const DAY = 24 * 60 * 60 * 1000;

/**
 * Retencao: "excluir" apaga a conversa; "anonimizar" mantem a conversa para
 * metricas sem conteudo, anexos, notas nem ligacao com visitante e contato.
 * Tambem confere a tabela de papeis (roles).
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("retencao e papeis", () => {
  let app: FastifyInstance;
  let masterCookie: string;

  beforeEach(async () => {
    files.clear();
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await fixture.createMaster(app);
  });

  afterAll(async () => {
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  /** Conversa do widget com visitante identificado, nota e anexo, de 100 dias atras. */
  async function oldConversation(t: Awaited<ReturnType<typeof fixture.createTenant>>) {
    const started = await fixture.startWidgetConversation(app, t.key, {
      externalUserId: "cliente-1",
      visitorName: "Maria",
      visitorEmail: "maria@x.com",
    });
    const conversationId = started.json().conversationId as string;
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversationId}/messages`,
      headers: { origin: fixture.WIDGET_ORIGIN },
      payload: { key: t.key, message: "Meu CPF e 123.456.789-00" },
    });
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/notes`,
      headers: { cookie: t.admin },
      payload: { content: "Cliente Maria pediu segunda via" },
    });
    const message = await db
      .selectFrom("messages")
      .select("id")
      .where("conversation_id", "=", conversationId)
      .executeTakeFirstOrThrow();
    const attachment = await attachmentsService.register(
      t.organizationId,
      message.id,
      "imagem",
      "rg.png",
    );
    await attachmentsService.saveFile(
      t.organizationId,
      attachment.id,
      Buffer.from("x"),
      "image/png",
    );
    await db
      .updateTable("conversations")
      .set({ started_at: new Date(Date.now() - 100 * DAY) } as never)
      .where("id", "=", conversationId)
      .execute();
    return conversationId;
  }

  it("anonimiza quando a organizacao escolhe e exclui no padrao", async () => {
    const a = await fixture.createTenant(app, masterCookie, "ret-a");
    const b = await fixture.createTenant(app, masterCookie, "ret-b");
    const kept = await oldConversation(a);
    const gone = await oldConversation(b);

    const setPolicy = (t: typeof a, payload: object) =>
      app.inject({
        method: "PUT",
        url: `${t.base}/retention`,
        headers: { cookie: t.admin },
        payload,
      });
    expect((await setPolicy(a, { days: 30, mode: "sumir" })).statusCode).toBe(400);
    expect((await setPolicy(a, { days: 30, mode: "anonimizar" })).statusCode).toBe(200);
    await setPolicy(b, { days: 30 });

    const summary = await retentionService.purgeExpired();
    for (const row of summary) {
      await inboxService.deleteNotesFor(row.organizationId, row.anonymizedConversationIds);
    }
    expect(summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: a.organizationId, anonymized: 1, deleted: 0 }),
        expect.objectContaining({ organizationId: b.organizationId, deleted: 1, anonymized: 0 }),
      ]),
    );

    // B: conversa apagada. A: conversa fica, sem nada que identifique.
    expect(
      await db.selectFrom("conversations").select("id").where("id", "=", gone).execute(),
    ).toEqual([]);
    const conversation = await db
      .selectFrom("conversations")
      .select(["visitor_id", "contact_id", "anonymized_at"])
      .where("id", "=", kept)
      .executeTakeFirstOrThrow();
    expect(conversation).toMatchObject({ visitor_id: null, contact_id: null });
    expect(conversation.anonymized_at).not.toBeNull();
    const messages = await db
      .selectFrom("messages")
      .select(["role", "content"])
      .where("conversation_id", "=", kept)
      .execute();
    expect(messages.length).toBeGreaterThan(0);
    expect(JSON.stringify(messages)).not.toContain("CPF");
    expect(
      await db.selectFrom("conversation_notes").where("conversation_id", "=", kept).execute(),
    ).toEqual([]);
    expect(files.size).toBe(0);
    const audit = await db
      .selectFrom("audit_events")
      .select("action")
      .where("organization_id", "=", a.organizationId)
      .where("action", "=", "Anonimizou conversas por retencao")
      .execute();
    expect(audit).toHaveLength(1);

    // A varredura seguinte nao repete a mesma conversa.
    const again = await retentionService.purgeExpired();
    expect(again.find((r) => r.organizationId === a.organizationId)).toBeUndefined();
  });

  it("lista os papeis da tabela roles e recusa papel inexistente", async () => {
    const t = await fixture.createTenant(app, masterCookie, "ret-c");
    const roles = await app.inject({
      method: "GET",
      url: `${t.base}/roles`,
      headers: { cookie: t.admin },
    });
    expect(roles.json().map((r: { name: string }) => r.name)).toEqual([
      "Administrador",
      "Editor de base",
      "Analista",
      "Atendente",
    ]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${t.base}/roles`,
          headers: { cookie: t.people.Analista.cookie },
        })
      ).statusCode,
    ).toBe(403);
    await expect(
      db
        .updateTable("memberships")
        .set({ role: "Dono" as never })
        .where("user_id", "=", t.people.Analista.userId)
        .execute(),
    ).rejects.toThrow();
  });
});
