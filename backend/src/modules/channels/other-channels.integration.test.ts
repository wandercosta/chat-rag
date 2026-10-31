import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { channelMessagesQueue } from "../../queue/channel-messages.queue.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { BAD_BOT_TOKEN, startFakeGraphApi } from "../../test/fake-graph-api.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";
import { processChannelJob } from "./index.js";

const APP_SECRET = "segredo-do-app-meta";
const PAGE_TOKEN = "EAApaginatokendetesteXYZ12345678";
const BOT_TOKEN = "700100:AAbotTokenDeTesteAAbotTokenDeTeste12";

const sign = (body: string) =>
  `sha256=${crypto.createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;

/**
 * Telegram, Messenger e Instagram (ADR-006, etapa 5) sobre a mesma camada do
 * WhatsApp, contra APIs simuladas: credencial conferida, webhook autenticado,
 * contato pelo id do canal, resposta pela base e resposta do atendente.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("telegram, messenger e instagram", () => {
  let app: FastifyInstance;
  let masterCookie: string;
  let fake: Awaited<ReturnType<typeof startFakeGraphApi>>;

  async function drainJobs() {
    const jobs = await channelMessagesQueue.getJobs(["waiting", "delayed", "prioritized"]);
    for (const job of jobs) {
      await processChannelJob(job.data);
      await job.remove();
    }
  }

  beforeAll(async () => {
    fake = await startFakeGraphApi();
  });

  beforeEach(async () => {
    fake.sent.length = 0;
    fake.metaMessages.length = 0;
    fake.telegram.length = 0;
    await channelMessagesQueue.obliterate({ force: true });
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await createMaster(app);
  });

  afterAll(async () => {
    await fake.close();
    await channelMessagesQueue.close();
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  it("telegram: registra o webhook, exige o token secreto e responde no chat", async () => {
    const t = await createTenant(app, masterCookie, "tg-a");
    const connect = (botToken: string) =>
      app.inject({
        method: "POST",
        url: `${t.base}/channels/telegram`,
        headers: { cookie: t.admin },
        payload: { name: "Bot da loja", assistantId: t.assistantId, botToken },
      });
    expect((await connect(BAD_BOT_TOKEN)).statusCode).toBe(422);

    const created = await connect(BOT_TOKEN);
    expect(created.statusCode).toBe(201);
    const connection = created.json();
    expect(connection).toMatchObject({ status: "ativo", external_id: "7001" });
    expect(created.body).not.toContain(BOT_TOKEN);

    const setWebhook = fake.telegram.find((c) => c.method === "setWebhook")!;
    expect(setWebhook.body.url).toContain(`/webhooks/telegram/${connection.id}`);
    const secret = setWebhook.body.secret_token as string;

    const update = {
      update_id: 1,
      message: {
        message_id: 10,
        chat: { id: 555, type: "private" },
        from: { first_name: "Ana", last_name: "Lima" },
        text: "Quero falar com um atendente",
      },
    };
    const post = (headers: Record<string, string>) =>
      app.inject({
        method: "POST",
        url: `/webhooks/telegram/${connection.id}`,
        headers: { "content-type": "application/json", ...headers },
        payload: JSON.stringify(update),
      });
    expect((await post({})).statusCode).toBe(401);
    expect((await post({ "x-telegram-bot-api-secret-token": "errado" })).statusCode).toBe(401);
    expect((await post({ "x-telegram-bot-api-secret-token": secret })).statusCode).toBe(200);
    await drainJobs();

    const reply = fake.telegram.find((c) => c.method === "sendMessage")!;
    expect(reply.body).toMatchObject({ chat_id: "555" });
    expect(reply.body.text).toContain("Um atendente vai continuar");

    const queue = await app.inject({
      method: "GET",
      url: `${t.base}/inbox?view=fila`,
      headers: { cookie: t.people.Atendente.cookie },
    });
    expect(queue.json()[0]).toMatchObject({ channel: "telegram", contact_label: "Ana Lima" });

    // Telegram nao tem janela de 24 horas: o atendente responde quando quiser.
    await db
      .updateTable("messages")
      .set({ created_at: new Date(Date.now() - 48 * 3600 * 1000) } as never)
      .execute();
    const agent = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${queue.json()[0].id}/messages`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { content: "Oi Ana!" },
    });
    expect(agent.statusCode).toBe(201);
    await drainJobs();
    expect(fake.telegram.at(-1)?.body).toMatchObject({ chat_id: "555", text: "Oi Ana!" });

    // Desconectar apaga o webhook no Telegram.
    await app.inject({
      method: "DELETE",
      url: `${t.base}/channels/${connection.id}`,
      headers: { cookie: t.admin },
    });
    expect(fake.telegram.at(-1)?.method).toBe("deleteWebhook");
  });

  it("messenger e instagram: assinatura da Meta, resposta pela Pagina e janela de 24 horas", async () => {
    const t = await createTenant(app, masterCookie, "meta-a");
    const messenger = (
      await app.inject({
        method: "POST",
        url: `${t.base}/channels/messenger`,
        headers: { cookie: t.admin },
        payload: {
          name: "Pagina",
          assistantId: t.assistantId,
          pageId: "4440001",
          accessToken: PAGE_TOKEN,
          appSecret: APP_SECRET,
        },
      })
    ).json();
    expect(messenger.config.pageName).toBe("Pagina Teste");

    const instagram = await app.inject({
      method: "POST",
      url: `${t.base}/channels/instagram`,
      headers: { cookie: t.admin },
      payload: {
        name: "Instagram",
        assistantId: t.assistantId,
        instagramAccountId: "5550001",
        pageId: "4440001",
        accessToken: PAGE_TOKEN,
        appSecret: APP_SECRET,
      },
    });
    expect(instagram.json().config).toMatchObject({ username: "loja.teste", pageId: "4440001" });

    const send = (provider: string, connectionId: string, accountId: string, mid: string) => {
      const body = JSON.stringify({
        entry: [
          {
            id: accountId,
            messaging: [{ sender: { id: `user-${provider}` }, message: { mid, text: "oi" } }],
          },
        ],
      });
      return app.inject({
        method: "POST",
        url: `/webhooks/${provider}/${connectionId}`,
        headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
        payload: body,
      });
    };
    expect((await send("messenger", messenger.id, "4440001", "m_in_1")).statusCode).toBe(200);
    expect((await send("instagram", instagram.json().id, "5550001", "ig_in_1")).statusCode).toBe(
      200,
    );
    // URL de um provedor com a conexao de outro: nao existe.
    expect((await send("telegram", messenger.id, "4440001", "x")).statusCode).toBe(404);
    await drainJobs();

    // As duas respostas saem pela Pagina, para o id de cada remetente.
    expect(fake.metaMessages.map((m) => [m.pageId, m.body.recipient.id]).sort()).toEqual([
      ["4440001", "user-instagram"],
      ["4440001", "user-messenger"],
    ]);

    // Recibo de entrega do Messenger.
    const outMid = fake.metaMessages.find((m) => m.body.recipient.id === "user-messenger")!;
    const delivered = JSON.stringify({
      entry: [{ id: "4440001", messaging: [{ delivery: { mids: [`m_out_${1}`, `m_out_${2}`] } }] }],
    });
    await app.inject({
      method: "POST",
      url: `/webhooks/messenger/${messenger.id}`,
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(delivered) },
      payload: delivered,
    });
    await drainJobs();
    const conversations = await app.inject({
      method: "GET",
      url: `${t.base}/inbox?view=assistente`,
      headers: { cookie: t.admin },
    });
    const messengerConversation = conversations
      .json()
      .find((c: { channel: string }) => c.channel === "messenger");
    expect(messengerConversation).toBeUndefined(); // so widget aparece nessa aba
    expect(outMid).toBeDefined();

    // Janela de 24 horas tambem vale no Instagram e no Messenger.
    const igConversation = await db
      .selectFrom("conversations")
      .select("id")
      .where("channel", "=", "instagram")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("messages")
      .set({ created_at: new Date(Date.now() - 25 * 3600 * 1000) } as never)
      .where("conversation_id", "=", igConversation.id)
      .execute();
    const late = await app.inject({
      method: "POST",
      url: `${t.base}/inbox/${igConversation.id}/messages`,
      headers: { cookie: t.people.Atendente.cookie },
      payload: { content: "ainda ai?" },
    });
    expect(late.statusCode).toBe(422);
  });
});
