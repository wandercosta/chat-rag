import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { campaignsQueue } from "../../queue/campaigns.queue.js";
import { channelMessagesQueue } from "../../queue/channel-messages.queue.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { startFakeGraphApi } from "../../test/fake-graph-api.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";
import { processChannelJob } from "../channels/index.js";
import { runCampaignTick } from "./index.js";

const APP_SECRET = "segredo-do-app-meta";

/**
 * Campanhas (ADR-006 #9, etapa 6): publico so com opt-in e endereco no canal,
 * modelo aprovado com "{{nome}}", lote no ritmo da campanha, opt-out na hora
 * do envio e por "SAIR", metricas de entrega/leitura/resposta, cancelamento,
 * papeis e isolamento.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("campanhas", () => {
  let app: FastifyInstance;
  let masterCookie: string;
  let fake: Awaited<ReturnType<typeof startFakeGraphApi>>;

  async function runTicks() {
    const jobs = await campaignsQueue.getJobs(["waiting", "delayed"]);
    for (const job of jobs) {
      await job.remove();
      await runCampaignTick(job.data.organizationId, job.data.campaignId);
    }
    return jobs.length;
  }

  async function drainChannel() {
    for (const job of await channelMessagesQueue.getJobs(["waiting", "delayed"])) {
      await processChannelJob(job.data);
      await job.remove();
    }
  }

  async function setup(slug: string) {
    const t = await createTenant(app, masterCookie, slug);
    const headers = { cookie: t.admin };
    const post = (url: string, payload: object) =>
      app.inject({ method: "POST", url: `${t.base}${url}`, headers, payload });

    const connection = (
      await post("/channels/whatsapp", {
        name: "WhatsApp",
        assistantId: t.assistantId,
        phoneNumberId: "123450001",
        wabaId: "998877665544",
        accessToken: "EAAtokendeacessodetesteXYZ123456",
        appSecret: APP_SECRET,
      })
    ).json();
    const templates = (await post(`/channels/${connection.id}/templates/sync`, {})).json();
    const template = templates.find((tpl: { name: string }) => tpl.name === "retomada");
    const vip = (await post("/contact-tags", { name: "VIP" })).json();

    const contact = async (name: string, extra: object) =>
      (await post("/contacts", { name, tagIds: [vip.id], ...extra })).json();
    const ana = await contact("Ana Souza", { phone: "11 91111-1111", optIn: true });
    await contact("Bruno", { phone: "11 92222-2222", optIn: false });
    await contact("Carla", { email: "carla@x.com", optIn: true });

    const segment = (
      await post("/contact-segments", { name: "VIP", filter: { tagIds: [vip.id] } })
    ).json();
    return { t, post, connection, template, segment, ana, vip };
  }

  beforeAll(async () => {
    fake = await startFakeGraphApi();
  });

  beforeEach(async () => {
    fake.sent.length = 0;
    await campaignsQueue.obliterate({ force: true });
    await channelMessagesQueue.obliterate({ force: true });
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await createMaster(app);
  });

  afterAll(async () => {
    await fake.close();
    await campaignsQueue.close();
    await channelMessagesQueue.close();
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  it("envia so para quem tem opt-in, mede entrega e resposta e respeita o SAIR", async () => {
    const { t, post, connection, template, segment, ana } = await setup("camp-a");

    const preview = await post("/campaigns/preview", {
      connectionId: connection.id,
      segmentId: segment.id,
    });
    expect(preview.json()).toEqual({ eligible: 1, withoutConsent: 1, withoutAddress: 1 });

    const invalid = await post("/campaigns", {
      name: "Sem variavel",
      connectionId: connection.id,
      segmentId: segment.id,
      templateId: template.id,
      templateParams: [],
    });
    expect(invalid.statusCode).toBe(422);

    const campaign = (
      await post("/campaigns", {
        name: "Retomada VIP",
        connectionId: connection.id,
        segmentId: segment.id,
        templateId: template.id,
        templateParams: ["{{nome}}"],
      })
    ).json();
    const scheduled = await post(`/campaigns/${campaign.id}/schedule`, {});
    expect(scheduled.json()).toMatchObject({ status: "agendada", stats: { total: 1, pending: 1 } });

    expect(await runTicks()).toBe(1);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].body).toMatchObject({ to: "5511911111111", type: "template" });
    expect(JSON.stringify(fake.sent[0].body.template)).toContain('"text":"Ana"');

    const webhook = (payload: object) => {
      const body = JSON.stringify(payload);
      return app.inject({
        method: "POST",
        url: `/webhooks/whatsapp/${connection.id}`,
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": `sha256=${crypto.createHmac("sha256", APP_SECRET).update(body).digest("hex")}`,
        },
        payload: body,
      });
    };
    const value = (v: object) => ({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "123450001" }, ...v } }] }],
    });
    await webhook(value({ statuses: [{ id: "wamid.out.1", status: "read" }] }));
    await webhook(
      value({
        contacts: [{ wa_id: "5511911111111", profile: { name: "Ana" } }],
        messages: [
          { id: "wamid.in.1", from: "5511911111111", type: "text", text: { body: "Pode sim!" } },
        ],
      }),
    );
    await drainChannel();

    const detail = (
      await app.inject({
        method: "GET",
        url: `${t.base}/campaigns/${campaign.id}`,
        headers: { cookie: t.people.Analista.cookie },
      })
    ).json();
    expect(detail.status).toBe("concluida");
    expect(detail.stats).toMatchObject({ sent: 1, delivered: 1, read: 1, replied: 1 });
    expect(detail.recipients[0]).toMatchObject({ label: "Ana Souza", delivery_status: "lida" });

    // A resposta caiu na mesma conversa do envio (com o mesmo contato).
    const contact = (
      await app.inject({
        method: "GET",
        url: `${t.base}/contacts/${ana.id}`,
        headers: { cookie: t.admin },
      })
    ).json();
    expect(contact.conversations).toHaveLength(1);

    // "SAIR" pelo canal tira a pessoa das proximas campanhas.
    await webhook(
      value({
        messages: [
          { id: "wamid.in.2", from: "5511911111111", type: "text", text: { body: "SAIR" } },
        ],
      }),
    );
    await drainChannel();
    expect(fake.sent.at(-1)?.body.text?.body).toContain("nao vai mais receber");
    const again = (
      await post("/campaigns", {
        name: "Outra",
        connectionId: connection.id,
        segmentId: segment.id,
        templateId: template.id,
        templateParams: ["x"],
      })
    ).json();
    expect((await post(`/campaigns/${again.id}/schedule`, {})).statusCode).toBe(422);
  });

  it("ignora quem saiu depois do agendamento e para quando cancelada", async () => {
    const { t, post, connection, template, segment, ana } = await setup("camp-b");
    const create = async (name: string) =>
      (
        await post("/campaigns", {
          name,
          connectionId: connection.id,
          segmentId: segment.id,
          templateId: template.id,
          templateParams: ["oi"],
        })
      ).json();

    const first = await create("Primeira");
    await post(`/campaigns/${first.id}/schedule`, {});
    await app.inject({
      method: "PATCH",
      url: `${t.base}/contacts/${ana.id}`,
      headers: { cookie: t.admin },
      payload: { optIn: false },
    });
    await runTicks();
    const skipped = (
      await app.inject({
        method: "GET",
        url: `${t.base}/campaigns/${first.id}`,
        headers: { cookie: t.admin },
      })
    ).json();
    expect(skipped.stats).toMatchObject({ skipped: 1, sent: 0 });
    expect(fake.sent).toHaveLength(0);

    await app.inject({
      method: "PATCH",
      url: `${t.base}/contacts/${ana.id}`,
      headers: { cookie: t.admin },
      payload: { optIn: true },
    });
    const second = await create("Segunda");
    const future = new Date(Date.now() + 3600_000).toISOString();
    await post(`/campaigns/${second.id}/schedule`, { at: future });
    const cancelled = await post(`/campaigns/${second.id}/cancel`, {});
    expect(cancelled.json().status).toBe("cancelada");
    await runTicks();
    expect(fake.sent).toHaveLength(0);

    // Papeis e isolamento.
    const asAgent = await app.inject({
      method: "POST",
      url: `${t.base}/campaigns/${second.id}/cancel`,
      headers: { cookie: t.people.Atendente.cookie },
    });
    expect(asAgent.statusCode).toBe(403);
    const other = await createTenant(app, masterCookie, "camp-c");
    const cross = await app.inject({
      method: "GET",
      url: `${other.base}/campaigns/${second.id}`,
      headers: { cookie: other.admin },
    });
    expect(cross.statusCode).toBe(404);
  });
});
