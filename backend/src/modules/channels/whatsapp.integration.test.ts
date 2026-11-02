import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Fontes em memoria: o teste cobre o canal, nao o storage S3.
const files = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("../../storage/objects.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../storage/objects.js")>()),
  putSourceFile: async (key: string, body: Buffer) => void files.set(key, body),
  getSourceFile: async (key: string) => files.get(key)!,
}));

const { buildApp } = await import("../../app.js");
const { db } = await import("../../db/client.js");
const { redis } = await import("../../db/redis.js");
const { realtime } = await import("../../realtime/events.js");
const { channelMessagesQueue } = await import("../../queue/channel-messages.queue.js");
const { processChannelJob } = await import("./index.js");
const { RUN_INTEGRATION_TESTS, resetDatabase } = await import("../../test/integration-helpers.js");
const { BAD_TOKEN, startFakeGraphApi } = await import("../../test/fake-graph-api.js");
const fixture = await import("../../test/tenant-fixture.js");

const APP_SECRET = "segredo-do-app-meta";
const ACCESS_TOKEN = "EAAtokendeacessodetesteXYZ123456";

function sign(body: string, secret = APP_SECRET) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

function messagePayload(phoneNumberId: string, id: string, text: string, from = "5511999998888") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from, profile: { name: "Maria Zap" } }],
              messages: [{ id, from, type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(phoneNumberId: string, id: string, status: string) {
  return {
    entry: [
      {
        changes: [
          { value: { metadata: { phone_number_id: phoneNumberId }, statuses: [{ id, status }] } },
        ],
      },
    ],
  };
}

/**
 * WhatsApp pela Cloud API oficial (ADR-006, etapa 4), contra uma API da Meta
 * simulada: conexao com token conferido, webhook assinado e idempotente, IA
 * respondendo com fontes, passagem para humano, recibos sem regredir, resposta
 * do atendente pela fila, janela de 24 horas e modelos.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("whatsapp", () => {
  let app: FastifyInstance;
  let masterCookie: string;
  let graph: Awaited<ReturnType<typeof startFakeGraphApi>>;

  /** O que o worker faria: processa os jobs que o webhook ou o painel enfileirou. */
  async function drainJobs() {
    const jobs = await channelMessagesQueue.getJobs(["waiting", "delayed", "prioritized"]);
    for (const job of jobs) {
      await processChannelJob(job.data);
      await job.remove();
    }
  }

  async function connect(t: Awaited<ReturnType<typeof fixture.createTenant>>, phoneId: string) {
    const res = await app.inject({
      method: "POST",
      url: `${t.base}/channels/whatsapp`,
      headers: { cookie: t.admin },
      payload: {
        name: "WhatsApp da loja",
        assistantId: t.assistantId,
        phoneNumberId: phoneId,
        wabaId: "998877665544",
        accessToken: ACCESS_TOKEN,
        appSecret: APP_SECRET,
      },
    });
    return res;
  }

  function webhook(connectionId: string, payload: object, secret = APP_SECRET) {
    const body = JSON.stringify(payload);
    return app.inject({
      method: "POST",
      url: `/webhooks/whatsapp/${connectionId}`,
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body, secret) },
      payload: body,
    });
  }

  beforeAll(async () => {
    graph = await startFakeGraphApi();
  });

  beforeEach(async () => {
    files.clear();
    graph.sent.length = 0;
    await channelMessagesQueue.obliterate({ force: true });
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await fixture.createMaster(app);
  });

  afterAll(async () => {
    await graph.close();
    await channelMessagesQueue.close();
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  it("confere o token, guarda o segredo cifrado e verifica o webhook", async () => {
    const t = await fixture.createTenant(app, masterCookie, "zap-a");
    const refused = await app.inject({
      method: "POST",
      url: `${t.base}/channels/whatsapp`,
      headers: { cookie: t.admin },
      payload: {
        name: "Errado",
        assistantId: t.assistantId,
        phoneNumberId: "111222333",
        wabaId: "998877665544",
        accessToken: BAD_TOKEN,
        appSecret: APP_SECRET,
      },
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().error).toContain("Invalid OAuth access token");

    const created = await connect(t, "111222333");
    expect(created.statusCode).toBe(201);
    const list = await app.inject({
      method: "GET",
      url: `${t.base}/channels`,
      headers: { cookie: t.admin },
    });
    for (const body of [created.body, list.body]) {
      expect(body).not.toContain(ACCESS_TOKEN);
      expect(body).not.toContain(APP_SECRET);
    }
    const connection = created.json();
    expect(connection.config.displayPhone).toBe("+55 11 4000-0000");
    expect(connection.webhookUrl).toContain(`/webhooks/whatsapp/${connection.id}`);

    const duplicate = await connect(t, "111222333");
    expect(duplicate.statusCode).toBe(409);

    const verify = (token: string) =>
      app.inject({
        method: "GET",
        url: `/webhooks/whatsapp/${connection.id}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=abc123`,
      });
    expect((await verify("errado")).statusCode).toBe(403);
    const ok = await verify(connection.verify_token);
    expect(ok.body).toBe("abc123");

    const unsigned = await webhook(connection.id, messagePayload("111222333", "w1", "oi"), "x");
    expect(unsigned.statusCode).toBe(401);
    expect(await channelMessagesQueue.count()).toBe(0);

    const asAgent = await app.inject({
      method: "GET",
      url: `${t.base}/channels`,
      headers: { cookie: t.people.Atendente.cookie },
    });
    expect(asAgent.statusCode).toBe(403);
  });

  it("responde pela base com fontes, sem repetir evento reenviado", async () => {
    const t = await fixture.createTenant(app, masterCookie, "zap-b");
    const topic = await app.inject({
      method: "POST",
      url: `${t.base}/topics`,
      headers: { cookie: t.admin },
      payload: { name: "Entregas" },
    });
    const source = await app.inject({
      method: "POST",
      url: `${t.base}/sources`,
      headers: { cookie: t.admin },
      payload: {
        topicId: topic.json().id,
        title: "Politica de entrega",
        kind: "texto",
        content:
          "O prazo de entrega para capitais e de 3 dias uteis apos a confirmacao do pagamento.",
      },
    });
    const { extractionService, sourcesService } = await import("../knowledge/index.js");
    const { indexingService } = await import("../rag/index.js");
    const { chunks } = await extractionService.extractAndChunk(t.organizationId, source.json().id);
    const count = await indexingService.embedAndStoreChunks(
      t.organizationId,
      source.json().id,
      topic.json().id,
      chunks,
    );
    await sourcesService.markReady(t.organizationId, source.json().id, count);

    const connection = (await connect(t, "222333444")).json();
    const payload = messagePayload(
      "222333444",
      "wamid.in.1",
      "Qual o prazo de entrega para capitais?",
    );
    expect((await webhook(connection.id, payload)).statusCode).toBe(200);
    await webhook(connection.id, payload); // a Meta reenviou o mesmo evento
    await drainJobs();

    expect(graph.sent).toHaveLength(1);
    expect(graph.sent[0].body.to).toBe("5511999998888");
    expect(graph.sent[0].body.text?.body).toContain("Fontes:\n[1] Politica de entrega");

    const contacts = await app.inject({
      method: "GET",
      url: `${t.base}/contacts`,
      headers: { cookie: t.admin },
    });
    expect(contacts.json().items[0]).toMatchObject({ name: "Maria Zap", phone: "+5511999998888" });
  });

  it("passa para humano, entrega a resposta do atendente e respeita janela e recibos", async () => {
    const t = await fixture.createTenant(app, masterCookie, "zap-c");
    const connection = (await connect(t, "333444555")).json();

    await webhook(
      connection.id,
      messagePayload("333444555", "wamid.in.2", "quero falar com um atendente"),
    );
    await drainJobs();
    expect(graph.sent[0].body.text?.body).toContain("Um atendente vai continuar");

    const queue = await app.inject({
      method: "GET",
      url: `${t.base}/inbox?view=fila`,
      headers: { cookie: t.people.Atendente.cookie },
    });
    const conversationId = queue.json()[0].id;
    expect(queue.json()[0].channel).toBe("whatsapp");

    // Com humano na conversa, a IA nao responde.
    await webhook(connection.id, messagePayload("333444555", "wamid.in.3", "ola?"));
    await drainJobs();
    expect(graph.sent).toHaveLength(1);

    const reply = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/messages`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { content: "Oi Maria, sou a atendente." },
    });
    expect(reply.statusCode).toBe(201);
    await drainJobs();
    expect(graph.sent[1].body.text?.body).toBe("Oi Maria, sou a atendente.");

    const detail = async () =>
      (
        await app.inject({
          method: "GET",
          url: `${t.base}/inbox/${conversationId}`,
          headers: { cookie: t.admin },
        })
      ).json();
    const agentMessage = (await detail()).messages.find(
      (m: { role: string }) => m.role === "atendente",
    );
    expect(agentMessage.delivery_status).toBe("enviada");

    // Recibos: lida nao volta para entregue quando o evento chega atrasado.
    await webhook(
      connection.id,
      statusPayload("333444555", agentMessage.provider_message_id, "read"),
    );
    await webhook(
      connection.id,
      statusPayload("333444555", agentMessage.provider_message_id, "delivered"),
    );
    await drainJobs();
    expect(
      (await detail()).messages.find((m: { id: string }) => m.id === agentMessage.id)
        .delivery_status,
    ).toBe("lida");

    // Recibo forjado por outro tenant (com o proprio app) nao mexe aqui.
    const other = await fixture.createTenant(app, masterCookie, "zap-d");
    const otherConnection = (await connect(other, "999888777")).json();
    await webhook(
      otherConnection.id,
      statusPayload("999888777", agentMessage.provider_message_id, "failed"),
    );
    await drainJobs();
    expect(
      (await detail()).messages.find((m: { id: string }) => m.id === agentMessage.id)
        .delivery_status,
    ).toBe("lida");

    // Janela de 24 horas fechada: texto livre recusado, modelo aprovado passa.
    await db
      .updateTable("messages")
      .set({ created_at: new Date(Date.now() - 25 * 3600 * 1000) } as never)
      .where("conversation_id", "=", conversationId)
      .execute();
    const late = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/messages`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { content: "ainda ai?" },
    });
    expect(late.statusCode).toBe(422);

    const templates = await app.inject({
      method: "POST",
      url: `${t.base}/channels/${connection.id}/templates/sync`,
      headers: { cookie: t.admin },
    });
    const approved = templates.json().find((tpl: { name: string }) => tpl.name === "retomada");
    const pending = templates.json().find((tpl: { name: string }) => tpl.name === "promocao");
    expect(approved).toMatchObject({
      variables: 1,
      body: "Oi {{1}}, podemos continuar o atendimento?",
    });

    const sendTemplate = (templateId: string, params: string[]) =>
      app.inject({
        method: "POST",
        url: `${t.base}/inbox/${conversationId}/template`,
        headers: { cookie: t.people.Atendente.cookie },
        payload: { templateId, params },
      });
    expect((await sendTemplate(pending.id, [])).statusCode).toBe(422);
    expect((await sendTemplate(approved.id, [])).statusCode).toBe(422);
    const sent = await sendTemplate(approved.id, ["Maria"]);
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({
      content: "Oi Maria, podemos continuar o atendimento?",
      delivery_status: "enviada",
    });
    expect(graph.sent.at(-1)?.body.template?.name).toBe("retomada");

    // Outro tenant nao envia modelo nessa conversa.
    const cross = await app.inject({
      method: "POST",
      url: `${other.base}/inbox/${conversationId}/template`,
      headers: { cookie: other.admin },
      payload: { templateId: approved.id, params: ["x"] },
    });
    expect(cross.statusCode).toBe(422);
  });
});
