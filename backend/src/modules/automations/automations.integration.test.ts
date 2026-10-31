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
import { scanNoReply } from "./index.js";

/**
 * Automacoes (ADR-006 #4, etapa 7): regra que responde fora do horario e cala
 * o assistente, regra por palavra-chave que etiqueta e passa para humano,
 * regra desligada que nao roda, "sem resposta" devolvendo para a fila uma vez
 * por silencio, versao no historico, papeis e isolamento.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("automacoes", () => {
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

  function message(key: string, conversationId: string, text: string) {
    return app.inject({
      method: "POST",
      url: `/widget/conversations/${conversationId}/messages`,
      headers: { origin: WIDGET_ORIGIN },
      payload: { key, message: text },
    });
  }

  it("responde fora do horario, etiqueta por palavra-chave e passa para humano", async () => {
    const t = await createTenant(app, masterCookie, "auto-a");
    const headers = { cookie: t.admin };
    const post = (url: string, payload: object) =>
      app.inject({ method: "POST", url: `${t.base}${url}`, headers, payload });
    const tag = (await post("/contact-tags", { name: "Interesse em preco" })).json();

    // Sem dia util na lista: e sempre "fora do horario".
    const offHours = (
      await post("/automations", {
        name: "Fora do horario",
        trigger: "mensagem_recebida",
        conditions: [
          { type: "primeira_mensagem" },
          { type: "fora_do_horario", start: "08:00", end: "18:00", weekdays: [] },
        ],
        actions: [{ type: "responder", text: "Estamos fora do horario; voltamos as 8h." }],
      })
    ).json();
    const pricing = (
      await post("/automations", {
        name: "Preco",
        trigger: "mensagem_recebida",
        conditions: [{ type: "texto_contem", keywords: ["preço", "valor"] }],
        actions: [{ type: "adicionar_etiqueta", tagId: tag.id }, { type: "encaminhar_humano" }],
      })
    ).json();
    const invalid = await post("/automations", {
      name: "Errada",
      trigger: "mensagem_recebida",
      conditions: [],
      actions: [{ type: "devolver_fila" }],
    });
    expect(invalid.statusCode).toBe(400);

    // Desligada nao roda: o assistente responde normalmente.
    const first = (
      await startWidgetConversation(app, t.key, { visitorEmail: "ana@x.com", visitorName: "Ana" })
    ).json().conversationId;
    const normal = await message(t.key, first, "oi");
    expect(normal.json().answer).not.toContain("fora do horario");

    for (const rule of [offHours, pricing]) {
      await post(`/automations/${rule.id}/enabled`, { enabled: true });
    }

    const second = (await startWidgetConversation(app, t.key, { visitorEmail: "bia@x.com" })).json()
      .conversationId;
    const reply = await message(t.key, second, "Bom dia, tudo bem?");
    expect(reply.json()).toEqual({
      answer: "Estamos fora do horario; voltamos as 8h.",
      citations: [],
      humanHandling: false,
    });

    // Segunda mensagem: nao e mais a primeira, mas fala de preco.
    const priced = await message(t.key, second, "qual o VALOR do plano?");
    expect(priced.json()).toMatchObject({ answer: null, humanHandling: true });
    const queue = await app.inject({
      method: "GET",
      url: `${t.base}/inbox?view=fila`,
      headers,
    });
    expect(queue.json().map((c: { id: string }) => c.id)).toContain(second);
    const contacts = await app.inject({
      method: "GET",
      url: `${t.base}/contacts?search=bia`,
      headers,
    });
    expect(contacts.json().items[0].tags.map((x: { name: string }) => x.name)).toEqual([
      "Interesse em preco",
    ]);

    const runs = await app.inject({
      method: "GET",
      url: `${t.base}/automations/${pricing.id}/runs`,
      headers: { cookie: t.people.Analista.cookie },
    });
    expect(runs.json()[0]).toMatchObject({
      status: "ok",
      rule_version: 1,
      detail: "etiquetou o contato, passou para a fila",
    });
  });

  it("devolve para a fila quem ficou sem resposta, uma vez por silencio", async () => {
    const t = await createTenant(app, masterCookie, "auto-b");
    const headers = { cookie: t.admin };
    const rule = (
      await app.inject({
        method: "POST",
        url: `${t.base}/automations`,
        headers,
        payload: {
          name: "Sem resposta",
          trigger: "sem_resposta",
          conditions: [{ type: "sem_resposta_ha", minutes: 15 }],
          actions: [
            { type: "devolver_fila" },
            { type: "nota_interna", text: "Voltou para a fila: 15 minutos sem resposta." },
          ],
        },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `${t.base}/automations/${rule.id}/enabled`,
      headers,
      payload: { enabled: true },
    });

    const conversationId = (await startWidgetConversation(app, t.key)).json().conversationId;
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversationId}/handoff`,
      headers: { origin: WIDGET_ORIGIN },
      payload: { key: t.key },
    });
    await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/assign`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { userId: t.people.Atendente.userId },
    });
    await message(t.key, conversationId, "alo?");

    // Ainda nao passou o tempo.
    expect(await scanNoReply(t.organizationId)).toBe(0);
    const later = new Date(Date.now() + 20 * 60_000);
    expect(await scanNoReply(t.organizationId, later)).toBe(1);
    // Mesmo silencio: nao roda de novo.
    expect(await scanNoReply(t.organizationId, later)).toBe(0);

    const detail = (
      await app.inject({ method: "GET", url: `${t.base}/inbox/${conversationId}`, headers })
    ).json();
    expect(detail.assignment.assignedUserId).toBeNull();
    expect(detail.notes[0]).toMatchObject({
      content: "Voltou para a fila: 15 minutos sem resposta.",
      author_email: null,
    });

    // Editar sobe a versao; Atendente nao edita; outro tenant nao ve.
    const edited = await app.inject({
      method: "PUT",
      url: `${t.base}/automations/${rule.id}`,
      headers,
      payload: {
        name: "Sem resposta (30 min)",
        trigger: "sem_resposta",
        conditions: [{ type: "sem_resposta_ha", minutes: 30 }],
        actions: [{ type: "devolver_fila" }],
      },
    });
    expect(edited.json().version).toBe(2);
    const asAgent = await app.inject({
      method: "POST",
      url: `${t.base}/automations/${rule.id}/enabled`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { enabled: false },
    });
    expect(asAgent.statusCode).toBe(403);
    const other = await createTenant(app, masterCookie, "auto-c");
    const cross = await app.inject({
      method: "GET",
      url: `${other.base}/automations/${rule.id}/runs`,
      headers: { cookie: other.admin },
    });
    expect(cross.statusCode).toBe(404);
  });
});
