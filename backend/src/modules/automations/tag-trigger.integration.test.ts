import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import {
  TAG_ADDED_JOB,
  automationsQueue,
  type TagAddedJob,
} from "../../queue/automations.queue.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { startFakeGraphApi } from "../../test/fake-graph-api.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";
import { automationTemplateSender } from "../channels/index.js";
import { onTagAdded, setTemplateSender } from "./index.js";

/**
 * Gatilho "etiqueta adicionada" com a acao "enviar modelo do WhatsApp": o
 * contato ganha a etiqueta, o worker roda a regra e o modelo sai pelo numero
 * com quem publicou a regra como responsavel. Reetiquetar nao dispara de novo.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("automacao por etiqueta", () => {
  let app: FastifyInstance;
  let masterCookie: string;
  let fake: Awaited<ReturnType<typeof startFakeGraphApi>>;

  /** O que o worker faria: so os jobs de etiqueta (a varredura nao entra). */
  async function drainTagJobs() {
    const jobs = await automationsQueue.getJobs(["waiting", "delayed", "prioritized"]);
    let count = 0;
    for (const job of jobs.filter((j) => j.name === TAG_ADDED_JOB)) {
      const { organizationId, contactId, tagId } = job.data as TagAddedJob;
      await onTagAdded(organizationId, contactId, tagId);
      await job.remove();
      count++;
    }
    return count;
  }

  beforeAll(async () => {
    fake = await startFakeGraphApi();
    setTemplateSender(automationTemplateSender);
  });

  beforeEach(async () => {
    fake.sent.length = 0;
    await automationsQueue.obliterate({ force: true });
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await createMaster(app);
  });

  afterAll(async () => {
    await fake.close();
    await automationsQueue.close();
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  it("envia o modelo quando o contato ganha a etiqueta, uma vez so", async () => {
    const t = await createTenant(app, masterCookie, "auto-tag");
    const headers = { cookie: t.admin };
    const call = (method: "POST" | "PATCH" | "PUT", url: string, payload: object) =>
      app.inject({ method, url: `${t.base}${url}`, headers, payload });

    const connection = (
      await call("POST", "/channels/whatsapp", {
        name: "WhatsApp",
        assistantId: t.assistantId,
        phoneNumberId: "123450009",
        wabaId: "998877665544",
        accessToken: "EAAtokendeacessodetesteXYZ123456",
        appSecret: "segredo-do-app-meta",
      })
    ).json();
    const templates = (await call("POST", `/channels/${connection.id}/templates/sync`, {})).json();
    const template = templates.find((tpl: { name: string }) => tpl.name === "retomada");
    const vencido = (await call("POST", "/contact-tags", { name: "Boleto vencido" })).json();
    const avisado = (await call("POST", "/contact-tags", { name: "Avisado" })).json();

    const rule = {
      name: "Cobranca amigavel",
      trigger: "etiqueta_adicionada",
      conditions: [{ type: "etiqueta_adicionada", tagId: vencido.id }],
      actions: [
        {
          type: "enviar_modelo",
          connectionId: connection.id,
          templateId: template.id,
          params: ["{nome}"],
        },
        { type: "adicionar_etiqueta", tagId: avisado.id },
      ],
    };
    // Sem dizer qual etiqueta, ou com acao de conversa, a regra nao passa.
    expect((await call("POST", "/automations", { ...rule, conditions: [] })).statusCode).toBe(400);
    expect(
      (
        await call("POST", "/automations", {
          ...rule,
          actions: [{ type: "encaminhar_humano" }],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call("POST", "/automations", {
          ...rule,
          trigger: "mensagem_recebida",
          conditions: [],
        })
      ).statusCode,
    ).toBe(400);
    const created = (await call("POST", "/automations", rule)).json();
    await call("POST", `/automations/${created.id}/enabled`, { enabled: true });

    const ana = (await call("POST", "/contacts", { name: "Ana", phone: "11 91111-1111" })).json();
    const semTelefone = (await call("POST", "/contacts", { name: "Sem Fone" })).json();
    expect(await drainTagJobs()).toBe(0);

    await call("PATCH", `/contacts/${ana.id}`, { name: "Ana", tagIds: [vencido.id] });
    // O job da etiqueta e, depois da regra, o da etiqueta "Avisado" (sem regra).
    expect(await drainTagJobs()).toBe(1);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].body).toMatchObject({
      to: "5511911111111",
      type: "template",
      template: {
        name: "retomada",
        components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }] }],
      },
    });
    expect(await drainTagJobs()).toBe(1);

    const tags = await db
      .selectFrom("contact_tag_links")
      .select("tag_id")
      .where("contact_id", "=", ana.id)
      .execute();
    expect(tags.map((r) => r.tag_id).sort()).toEqual([vencido.id, avisado.id].sort());

    // A mensagem fica na conversa do contato, com quem publicou a regra.
    const message = await db
      .selectFrom("messages as m")
      .innerJoin("conversations as c", "c.id", "m.conversation_id")
      .select(["m.role", "m.author_user_id", "m.content"])
      .where("c.contact_id", "=", ana.id)
      .executeTakeFirstOrThrow();
    expect(message).toMatchObject({
      role: "atendente",
      content: expect.stringContaining("Oi Ana"),
    });
    expect(message.author_user_id).not.toBeNull();

    // Salvar de novo com a mesma etiqueta nao dispara.
    await call("PATCH", `/contacts/${ana.id}`, { name: "Ana", tagIds: [vencido.id, avisado.id] });
    expect(await drainTagJobs()).toBe(0);
    expect(fake.sent).toHaveLength(1);

    // Contato sem telefone: a regra roda e o historico registra o erro.
    await call("PATCH", `/contacts/${semTelefone.id}`, { name: "Sem Fone", tagIds: [vencido.id] });
    await drainTagJobs();
    const runs = (
      await app.inject({
        method: "GET",
        url: `${t.base}/automations/${created.id}/runs`,
        headers,
      })
    ).json() as { status: string; detail: string }[];
    expect(runs.map((r) => r.status).sort()).toEqual(["erro", "ok"]);
    expect(runs.find((r) => r.status === "erro")?.detail).toContain("sem endereco");
  });
});
