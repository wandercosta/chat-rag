import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";
import { teamChatService } from "./index.js";

type Thread = { id: string; kind: string; otherEmail: string | null; unread: number };

/**
 * Chat interno da equipe: canal Geral e conversas diretas, so entre membros
 * da organizacao. Conversa direta e so das duas pessoas; o Master nao entra,
 * nem com sessao de suporte.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("chat interno da equipe", () => {
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

  const call = (method: "GET" | "POST" | "PUT", url: string, cookie: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie }, payload });

  it("canal Geral, conversa direta e nao lidas", async () => {
    const t = await createTenant(app, masterCookie, "equipe-a");
    const chat = `${t.base}/team-chat`;
    const agent = t.people.Atendente;
    const editor = t.people["Editor de base"];

    const threads = (await call("GET", `${chat}/threads`, t.admin)).json() as Thread[];
    expect(threads).toHaveLength(1);
    const general = threads[0];
    expect(general).toMatchObject({ kind: "geral", unread: 0 });

    const sent = await call("POST", `${chat}/threads/${general.id}/messages`, t.admin, {
      content: "Bom dia, equipe",
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({
      content: "Bom dia, equipe",
      authorEmail: "admin@equipe-a.local",
    });

    // Quem escreveu nao tem nao lida; os outros tem uma ate abrir.
    expect((await call("GET", `${chat}/threads`, t.admin)).json()[0].unread).toBe(0);
    expect((await call("GET", `${chat}/threads`, agent.cookie)).json()[0].unread).toBe(1);
    const messages = (
      await call("GET", `${chat}/threads/${general.id}/messages`, agent.cookie)
    ).json();
    expect(messages).toHaveLength(1);
    expect((await call("GET", `${chat}/threads`, agent.cookie)).json()[0].unread).toBe(0);

    // Conversa direta: a mesma para os dois lados, invisivel para terceiros.
    const people = (await call("GET", `${chat}/people`, agent.cookie)).json() as {
      userId: string;
      email: string;
    }[];
    const admin = people.find((p) => p.email === "admin@equipe-a.local")!;
    expect(people.some((p) => p.userId === agent.userId)).toBe(false);
    const direct = (
      await call("POST", `${chat}/direct`, agent.cookie, { userId: admin.userId })
    ).json();
    const again = (await call("POST", `${chat}/direct`, t.admin, { userId: agent.userId })).json();
    expect(again.id).toBe(direct.id);
    expect(
      (await call("POST", `${chat}/direct`, agent.cookie, { userId: agent.userId })).statusCode,
    ).toBe(400);

    await call("POST", `${chat}/threads/${direct.id}/messages`, agent.cookie, {
      content: "Pode olhar o cliente da fila?",
    });
    const adminThreads = (await call("GET", `${chat}/threads`, t.admin)).json() as Thread[];
    expect(adminThreads.find((th) => th.id === direct.id)).toMatchObject({
      kind: "direto",
      otherEmail: "atendente@equipe-a.local",
      unread: 1,
    });
    const editorThreads = (await call("GET", `${chat}/threads`, editor.cookie)).json() as Thread[];
    expect(editorThreads.map((th) => th.id)).toEqual([general.id]);
    expect(
      (await call("GET", `${chat}/threads/${direct.id}/messages`, editor.cookie)).statusCode,
    ).toBe(404);
    expect(
      (
        await call("POST", `${chat}/threads/${direct.id}/messages`, editor.cookie, {
          content: "oi",
        })
      ).statusCode,
    ).toBe(404);
  });

  it("isola organizacoes e deixa o Master de fora", async () => {
    const a = await createTenant(app, masterCookie, "equipe-b");
    const b = await createTenant(app, masterCookie, "equipe-c");
    const generalA = (await call("GET", `${a.base}/team-chat/threads`, a.admin)).json()[0];

    // Admin de B nao le o Geral de A, nem pela rota da propria organizacao.
    expect((await call("GET", `${a.base}/team-chat/threads`, b.admin)).statusCode).toBe(403);
    expect(
      (await call("GET", `${b.base}/team-chat/threads/${generalA.id}/messages`, b.admin))
        .statusCode,
    ).toBe(404);
    // Conversa direta com alguem de outra organizacao nao abre.
    expect(
      (
        await call("POST", `${b.base}/team-chat/direct`, b.admin, {
          userId: a.people.Atendente.userId,
        })
      ).statusCode,
    ).toBe(400);

    // Master com sessao de suporte ativa continua sem acesso ao chat.
    const session = await app.inject({
      method: "POST",
      url: `/master/tenants/${a.organizationId}/support-sessions`,
      headers: { cookie: masterCookie },
      payload: { justification: "Teste do isolamento do chat interno da equipe" },
    });
    expect(session.statusCode).toBeLessThan(300);
    expect((await call("GET", `${a.base}/team-chat/threads`, masterCookie)).statusCode).toBe(403);
  });

  it("avisa por SSE so quem participa da conversa", async () => {
    const t = await createTenant(app, masterCookie, "equipe-d");
    const chat = `${t.base}/team-chat`;
    const agent = t.people.Atendente;
    const editor = t.people["Editor de base"];
    const adminId = (
      (await call("GET", `${chat}/people`, agent.cookie)).json() as {
        userId: string;
        email: string;
      }[]
    ).find((p) => p.email === "admin@equipe-d.local")!.userId;
    const direct = (await call("POST", `${chat}/direct`, agent.cookie, { userId: adminId })).json();
    const general = (await call("GET", `${chat}/threads`, agent.cookie)).json()[0];

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}${chat}/events`, {
      headers: { cookie: editor.cookie },
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read(); // ": conectado"

    await call("POST", `${chat}/threads/${direct.id}/messages`, agent.cookie, {
      content: "so nos dois",
    });
    await call("POST", `${chat}/threads/${general.id}/messages`, agent.cookie, {
      content: "para todos",
    });

    let received = "";
    while (!received.includes(general.id)) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value);
    }
    controller.abort();
    await app.close();

    expect(received).toContain('"kind":"team_message"');
    expect(received).not.toContain(direct.id);
    expect(received).not.toContain("para todos");
  });

  it("retencao apaga mensagens alem do prazo da organizacao", async () => {
    const t = await createTenant(app, masterCookie, "equipe-e");
    await call("PUT", `${t.base}/retention`, t.admin, { days: 30 });
    const general = (await call("GET", `${t.base}/team-chat/threads`, t.admin)).json()[0];
    await call("POST", `${t.base}/team-chat/threads/${general.id}/messages`, t.admin, {
      content: "recente",
    });
    await db
      .insertInto("team_messages")
      .values({
        organization_id: t.organizationId,
        thread_id: general.id,
        author_user_id: null,
        content: "antiga",
        created_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .execute();

    expect(await teamChatService.purgeExpired()).toEqual([
      { organizationId: t.organizationId, deleted: 1 },
    ]);
    const left = (
      await call("GET", `${t.base}/team-chat/threads/${general.id}/messages`, t.admin)
    ).json();
    expect(left.map((m: { content: string }) => m.content)).toEqual(["recente"]);
  });
});
