import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Storage em memoria: o teste cobre o caminho do arquivo (provedor > storage >
// painel), nao o S3. O CI nao sobe storage.
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
const { channelMessagesQueue } = await import("../../queue/channel-messages.queue.js");
const { RUN_INTEGRATION_TESTS, resetDatabase } = await import("../../test/integration-helpers.js");
const { FAKE_FILES, FAKE_GRAPH_PORT, startFakeGraphApi } =
  await import("../../test/fake-graph-api.js");
const { createMaster, createTenant } = await import("../../test/tenant-fixture.js");
const { processChannelJob } = await import("./index.js");
const { parseWhatsAppWebhook } = await import("./whatsapp.webhook.js");
const { parseMessagingWebhook } = await import("./meta-messaging.js");
const { parseTelegramUpdate } = await import("./telegram.js");

const ACCESS_TOKEN = "EAAtokendetestedonumeroXYZ12345678";
const APP_SECRET = "segredo-do-app-meta";
const BOT_TOKEN = "700100:AAbotTokenDeTesteAAbotTokenDeTeste12";
const PHONE_ID = "123456789";
const CDN = `http://127.0.0.1:${FAKE_GRAPH_PORT}/files`;

/**
 * Midia recebida pelos canais: o worker baixa do provedor (com o token no
 * WhatsApp, pelo getFile no Telegram, do CDN no Messenger), guarda no storage
 * e o painel baixa pela conversa, com as permissoes dela.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("midia recebida pelos canais", () => {
  let app: FastifyInstance;
  let masterCookie: string;
  let fake: Awaited<ReturnType<typeof startFakeGraphApi>>;

  const inbound = async (connectionId: string, message: unknown) =>
    processChannelJob({ kind: "inbound", connectionId, message: message as never });

  async function connect(t: Awaited<ReturnType<typeof createTenant>>, provider: string) {
    const payload =
      provider === "whatsapp"
        ? { phoneNumberId: PHONE_ID, wabaId: "998877665544", accessToken: ACCESS_TOKEN }
        : provider === "telegram"
          ? { botToken: BOT_TOKEN }
          : { pageId: "4440001", accessToken: ACCESS_TOKEN };
    const response = await app.inject({
      method: "POST",
      url: `${t.base}/channels/${provider}`,
      headers: { cookie: t.admin },
      payload: { name: provider, assistantId: t.assistantId, appSecret: APP_SECRET, ...payload },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  async function messagesOf(t: Awaited<ReturnType<typeof createTenant>>, cookie = t.admin) {
    const list = await app.inject({
      method: "GET",
      url: `${t.base}/conversations`,
      headers: { cookie: t.admin },
    });
    const conversationId = list.json()[0].id as string;
    const detail = await app.inject({
      method: "GET",
      url: `${t.base}/conversations/${conversationId}`,
      headers: { cookie },
    });
    return { conversationId, messages: detail.json().messages as Record<string, unknown>[] };
  }

  beforeAll(async () => {
    fake = await startFakeGraphApi();
  });

  beforeEach(async () => {
    files.clear();
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

  it("whatsapp: baixa com o token, guarda e o painel baixa como anexo", async () => {
    const t = await createTenant(app, masterCookie, "midia-a");
    const connectionId = await connect(t, "whatsapp");
    const parsed = parseWhatsAppWebhook(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: PHONE_ID },
                  contacts: [{ wa_id: "5511988887777", profile: { name: "Ana" } }],
                  messages: [
                    {
                      id: "wamid.foto",
                      from: "5511988887777",
                      type: "image",
                      image: {
                        id: "media.foto.jpg",
                        mime_type: "image/jpeg",
                        caption: "Chegou assim",
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      PHONE_ID,
    );
    expect(parsed.messages[0]).toMatchObject({
      text: "Chegou assim",
      media: [{ kind: "imagem", ref: "media.foto.jpg" }],
    });
    await inbound(connectionId, parsed.messages[0]);

    const { conversationId, messages } = await messagesOf(t);
    const visitor = messages.find((m) => m.role === "visitante")!;
    expect(visitor.content).toBe("Chegou assim");
    const [attachment] = visitor.attachments as Record<string, unknown>[];
    expect(attachment).toMatchObject({
      kind: "imagem",
      status: "pronto",
      mime_type: "image/jpeg",
      size_bytes: FAKE_FILES["foto.jpg"].body.length,
    });
    expect(attachment).not.toHaveProperty("storage_key");

    const url = `${t.base}/conversations/${conversationId}/attachments/${attachment.id}`;
    for (const role of ["Atendente", "Analista"] as const) {
      const download = await app.inject({
        method: "GET",
        url,
        headers: { cookie: t.people[role].cookie },
      });
      expect(download.statusCode).toBe(200);
      expect(download.rawPayload.equals(FAKE_FILES["foto.jpg"].body)).toBe(true);
      expect(download.headers["content-disposition"]).toMatch(/^attachment;/);
      expect(download.headers["x-content-type-options"]).toBe("nosniff");
    }
    expect(
      (
        await app.inject({
          method: "GET",
          url,
          headers: { cookie: t.people["Editor de base"].cookie },
        })
      ).statusCode,
    ).toBe(403);

    // Outro tenant nao alcanca o arquivo nem pela propria organizacao.
    const other = await createTenant(app, masterCookie, "midia-b");
    const crossed = await app.inject({
      method: "GET",
      url: `${other.base}/conversations/${conversationId}/attachments/${attachment.id}`,
      headers: { cookie: other.admin },
    });
    expect(crossed.statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `${t.base}/conversations/x/attachments/y`,
          headers: { cookie: t.admin },
        })
      ).statusCode,
    ).toBe(404);

    // Excluir o contato apaga a conversa e o arquivo no storage.
    expect(files.size).toBe(1);
    const contacts = await app.inject({
      method: "GET",
      url: `${t.base}/contacts`,
      headers: { cookie: t.admin },
    });
    const contactId = (contacts.json().items ?? contacts.json())[0].id;
    const removed = await app.inject({
      method: "DELETE",
      url: `${t.base}/contacts/${contactId}`,
      headers: { cookie: t.admin },
    });
    expect(removed.statusCode).toBeLessThan(300);
    expect(files.size).toBe(0);
  });

  it("telegram e messenger: arquivo pelo getFile e pelo CDN; acima do teto vira falhou", async () => {
    const t = await createTenant(app, masterCookie, "midia-c");
    const telegramId = await connect(t, "telegram");
    const update = parseTelegramUpdate({
      message: {
        message_id: 7,
        chat: { id: 900, type: "private" },
        from: { first_name: "Bia" },
        document: { file_id: "nota.pdf", file_name: "nota.pdf", mime_type: "application/pdf" },
      },
    });
    expect(update.messages[0]).toMatchObject({ text: "[documento recebido]" });
    await inbound(telegramId, update.messages[0]);
    const telegram = await messagesOf(t);
    const doc = (telegram.messages.find((m) => m.role === "visitante")!.attachments as never[])[0];
    expect(doc).toMatchObject({ kind: "documento", status: "pronto", file_name: "nota.pdf" });
    // O token do bot vai na URL do arquivo: nao pode sobrar em erro nem em coluna.
    expect(JSON.stringify(telegram.messages)).not.toContain(BOT_TOKEN);

    await db.deleteFrom("conversations").execute();
    const messengerId = await connect(t, "messenger");
    const parsed = parseMessagingWebhook(
      {
        entry: [
          {
            id: "4440001",
            messaging: [
              {
                sender: { id: "psid-1" },
                message: {
                  mid: "m_midia",
                  attachments: [
                    { type: "video", payload: { url: `${CDN}/grande` } },
                    { type: "image", payload: { url: "https://169.254.169.254/latest" } },
                  ],
                },
              },
            ],
          },
        ],
      },
      "4440001",
    );
    await inbound(messengerId, parsed.messages[0]);
    const messenger = await messagesOf(t);
    const [big, internal] = messenger.messages.find((m) => m.role === "visitante")!
      .attachments as Record<string, unknown>[];
    expect(big).toMatchObject({ kind: "video", status: "falhou" });
    expect(big.error).toContain("maior que o limite");
    expect(internal).toMatchObject({ status: "falhou", error: "o arquivo nao vem do CDN da Meta" });
    expect(files.size).toBe(1); // so o PDF do Telegram
  });
});
