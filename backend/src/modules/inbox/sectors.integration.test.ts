import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime, type InboxEvent } from "../../realtime/events.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import {
  WIDGET_ORIGIN as ORIGIN,
  createMaster,
  createTenant,
  login,
  startWidgetConversation,
} from "../../test/tenant-fixture.js";

/**
 * Setores e transferencia: fila do Atendente so com o que e sem setor ou dos
 * setores dele; transferir muda pessoa/setor, deixa nota interna e avisa o
 * painel de quem recebe; Atendente nao transfere conversa de outra pessoa.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("setores e transferencia", () => {
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

  async function queued(key: string, externalUserId: string) {
    const started = await startWidgetConversation(app, key, { externalUserId });
    const conversationId = started.json().conversationId as string;
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversationId}/handoff`,
      headers: { origin: ORIGIN },
      payload: { key },
    });
    return conversationId;
  }

  it("monta setores, filtra a fila e transfere com nota e aviso", async () => {
    const t = await createTenant(app, masterCookie, "setor-a");
    const ana = t.people.Atendente;
    // Segunda pessoa que atende, fora do setor.
    const bruno = await app.inject({
      method: "POST",
      url: `${t.base}/members`,
      headers: { cookie: t.admin },
      payload: { email: "bruno@setor-a.local", password: "senha-membro-123", role: "Atendente" },
    });
    const brunoId = bruno.json().user_id as string;
    const brunoCookie = await login(app, "bruno@setor-a.local", "senha-membro-123");

    const sectors = `${t.base}/inbox-sectors`;
    const create = (cookie: string, name: string) =>
      app.inject({ method: "POST", url: sectors, headers: { cookie }, payload: { name } });
    expect((await create(ana.cookie, "Financeiro")).statusCode).toBe(403);
    const financeiro = (await create(t.admin, "Financeiro")).json();
    expect((await create(t.admin, "financeiro")).statusCode).toBe(409);

    const setMembers = (memberIds: string[]) =>
      app.inject({
        method: "PATCH",
        url: `${sectors}/${financeiro.id}`,
        headers: { cookie: t.admin },
        payload: { memberIds },
      });
    // Analista nao atende: nao entra em setor.
    expect((await setMembers([t.people.Analista.userId])).statusCode).toBe(422);
    expect((await setMembers([ana.userId])).json().memberIds).toEqual([ana.userId]);

    const first = await queued(t.key, "cliente-1");
    const second = await queued(t.key, "cliente-2");

    const events: InboxEvent[] = [];
    const unsubscribe = await realtime.subscribe(t.organizationId, (e) => events.push(e));

    // Ana manda a primeira para o Financeiro (fica na fila do setor).
    const toSector = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${first}/transfer`,
      headers: { cookie: ana.cookie },
      payload: { sectorId: financeiro.id, reason: "segunda via de boleto" },
    });
    expect(toSector.statusCode).toBe(200);
    expect(toSector.json()).toMatchObject({ sector_id: financeiro.id, assigned_user_id: null });

    const queue = async (cookie: string, query = "") =>
      (
        await app.inject({
          method: "GET",
          url: `${t.base}/inbox?view=fila${query}`,
          headers: { cookie },
        })
      ).json() as { id: string; assignment: { sectorName: string | null } }[];
    // Bruno nao e do Financeiro: so ve a conversa sem setor.
    expect((await queue(brunoCookie)).map((c) => c.id)).toEqual([second]);
    expect((await queue(ana.cookie)).map((c) => c.id).sort()).toEqual([first, second].sort());
    const filtered = await queue(t.admin, `&sectorId=${financeiro.id}`);
    expect(filtered.map((c) => c.id)).toEqual([first]);
    expect(filtered[0].assignment.sectorName).toBe("Financeiro");

    // Ana assume a segunda; Bruno nao pode transferir a conversa dela.
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${second}/assign`,
      headers: { cookie: ana.cookie },
      payload: { userId: ana.userId },
    });
    const stolen = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${second}/transfer`,
      headers: { cookie: brunoCookie },
      payload: { userId: brunoId },
    });
    expect(stolen.statusCode).toBe(403);

    // Ana passa para o Bruno: nota interna com o motivo e aviso ao Bruno.
    const toBruno = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${second}/transfer`,
      headers: { cookie: ana.cookie },
      payload: { userId: brunoId, reason: "cliente fala espanhol" },
    });
    expect(toBruno.json()).toMatchObject({ assigned_user_id: brunoId });
    const detail = await app.inject({
      method: "GET",
      url: `${t.base}/inbox/${second}`,
      headers: { cookie: brunoCookie },
    });
    expect(detail.json().notes.at(-1).content).toBe(
      "Transferiu a conversa para bruno@setor-a.local. Motivo: cliente fala espanhol",
    );
    // Pessoa invalida (Analista) e corpo vazio.
    const invalid = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${second}/transfer`,
      headers: { cookie: brunoCookie },
      payload: { userId: t.people.Analista.userId },
    });
    expect(invalid.statusCode).toBe(422);
    const empty = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${second}/transfer`,
      headers: { cookie: brunoCookie },
      payload: {},
    });
    expect(empty.statusCode).toBe(400);

    await new Promise((r) => setTimeout(r, 100));
    unsubscribe();
    const transfers = events.filter((e) => e.kind === "transfer");
    expect(transfers).toEqual([
      expect.objectContaining({ conversationId: first, toSectorId: financeiro.id, toUserId: null }),
      expect.objectContaining({ conversationId: second, toUserId: brunoId, byUserId: ana.userId }),
    ]);
    // O motivo e nota interna: nunca vai no evento.
    expect(JSON.stringify(events)).not.toContain("espanhol");

    // Excluir o setor devolve a conversa a fila geral.
    await app.inject({
      method: "DELETE",
      url: `${sectors}/${financeiro.id}`,
      headers: { cookie: t.admin },
    });
    expect((await queue(brunoCookie)).map((c) => c.id)).toEqual([first]);

    // Outro tenant nao enxerga nem usa o setor.
    const other = await createTenant(app, masterCookie, "setor-b");
    const otherSector = (
      await app.inject({
        method: "POST",
        url: `${other.base}/inbox-sectors`,
        headers: { cookie: other.admin },
        payload: { name: "Suporte" },
      })
    ).json();
    const crossed = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${first}/transfer`,
      headers: { cookie: t.admin },
      payload: { sectorId: otherSector.id },
    });
    expect(crossed.statusCode).toBe(422);
  });
});
