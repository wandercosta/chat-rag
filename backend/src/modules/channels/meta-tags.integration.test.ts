import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { channelMessagesQueue } from "../../queue/channel-messages.queue.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { startFakeGraphApi } from "../../test/fake-graph-api.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";
import { processChannelJob } from "./index.js";

const PAGE_TOKEN = "EAApaginatokendetesteXYZ12345678";
const APP_SECRET = "segredo-do-app-meta";
const HOUR = 3600 * 1000;

/**
 * Messenger e Instagram: nome do contato pela API de perfil (so no primeiro
 * contato) e a tag "Agente humano", que estende a janela do atendente de 24
 * horas para 7 dias quando o administrador liga na conexao.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("messenger e instagram: perfil e tag", () => {
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
    fake.metaMessages.length = 0;
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

  it("busca o nome no perfil e responde fora das 24 horas so com a tag ligada", async () => {
    const t = await createTenant(app, masterCookie, "tag-a");
    const connection = (
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

    await processChannelJob({
      kind: "inbound",
      connectionId: connection.id,
      message: { providerMessageId: "m_1", from: "psid-9", name: null, text: "Quero um atendente" },
    });
    const queue = await app.inject({
      method: "GET",
      url: `${t.base}/inbox?view=fila`,
      headers: { cookie: t.people.Atendente.cookie },
    });
    expect(queue.json()[0]).toMatchObject({ channel: "messenger", contact_label: "Carla Souza" });
    const conversationId = queue.json()[0].id;

    // Dois dias depois da ultima mensagem do cliente.
    await db
      .updateTable("messages")
      .set({ created_at: new Date(Date.now() - 48 * HOUR) } as never)
      .execute();
    const reply = () =>
      app.inject({
        method: "POST",
        url: `${t.base}/inbox/${conversationId}/messages`,
        headers: { cookie: t.people.Atendente.cookie },
        payload: { content: "Oi Carla, voltando ao seu pedido" },
      });
    expect((await reply()).statusCode).toBe(422);

    // So o administrador liga a tag; em WhatsApp ela nao existe.
    const toggle = (cookie: string, humanAgentTag: boolean) =>
      app.inject({
        method: "PATCH",
        url: `${t.base}/channels/${connection.id}`,
        headers: { cookie },
        payload: { humanAgentTag },
      });
    expect((await toggle(t.people.Atendente.cookie, true)).statusCode).toBe(403);
    const on = await toggle(t.admin, true);
    expect(on.statusCode).toBe(200);
    expect(on.json().config.humanAgentTag).toBe("true");
    expect(on.body).not.toContain(PAGE_TOKEN);

    const detail = await app.inject({
      method: "GET",
      url: `${t.base}/inbox/${conversationId}`,
      headers: { cookie: t.people.Atendente.cookie },
    });
    const endsAt = new Date(detail.json().replyWindowEndsAt).getTime();
    expect(endsAt - Date.now()).toBeGreaterThan(4 * 24 * HOUR);

    expect((await reply()).statusCode).toBe(201);
    await drainJobs();
    expect(fake.metaMessages.at(-1)?.body).toMatchObject({
      recipient: { id: "psid-9" },
      messaging_type: "MESSAGE_TAG",
      tag: "HUMAN_AGENT",
    });

    // Passou de 7 dias: nem com a tag.
    await db
      .updateTable("messages")
      .set({ created_at: new Date(Date.now() - 8 * 24 * HOUR) } as never)
      .where("role", "=", "visitante")
      .execute();
    expect((await reply()).statusCode).toBe(422);

    // Dentro das 24 horas a resposta sai normal, sem a tag.
    await processChannelJob({
      kind: "inbound",
      connectionId: connection.id,
      message: { providerMessageId: "m_2", from: "psid-9", name: null, text: "Oi de novo" },
    });
    expect((await reply()).statusCode).toBe(201);
    await drainJobs();
    expect(fake.metaMessages.at(-1)?.body.messaging_type).toBe("RESPONSE");
  });

  it("instagram: nome pelo usuario; contato ja conhecido nao consulta de novo", async () => {
    const t = await createTenant(app, masterCookie, "tag-b");
    const connection = (
      await app.inject({
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
      })
    ).json();
    const send = (mid: string) =>
      processChannelJob({
        kind: "inbound",
        connectionId: connection.id,
        message: { providerMessageId: mid, from: "igsid-3", name: null, text: "atendente" },
      });
    await send("ig_1");
    const contacts = await db.selectFrom("contacts").select("name").execute();
    expect(contacts).toEqual([{ name: "Duda Lima" }]);

    // O administrador renomeia; a proxima mensagem nao sobrescreve.
    await db.updateTable("contacts").set({ name: "Duda (cliente VIP)" }).execute();
    await send("ig_2");
    expect(await db.selectFrom("contacts").select("name").execute()).toEqual([
      { name: "Duda (cliente VIP)" },
    ]);
  });
});
