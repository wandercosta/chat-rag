import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Instagram so recebe arquivo por URL publica: o link assinado usa esta base.
process.env.PUBLIC_API_URL = "https://api.chatrag.test";

// Storage em memoria: o teste cobre o caminho do arquivo, nao o S3.
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
const { startFakeGraphApi } = await import("../../test/fake-graph-api.js");
const fixture = await import("../../test/tenant-fixture.js");
const { attachmentsService } = await import("../conversations/index.js");
const { processChannelJob } = await import("./index.js");

const APP_SECRET = "segredo-do-app-meta";
const TOKEN = "EAAtokendetestedonumeroXYZ12345678";
const BOT_TOKEN = "700100:AAbotTokenDeTesteAAbotTokenDeTeste12";
const PDF = Buffer.from("%PDF-1.4 proposta comercial");
const PNG = Buffer.from("\x89PNG imagem de teste");

const sign = (body: string) =>
  `sha256=${crypto.createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;

/** Corpo multipart como o navegador manda (`caption` e `file`). */
function multipart(file: { name: string; type: string; data: Buffer }, caption?: string) {
  const boundary = "----chatrag-teste";
  const parts: Buffer[] = [];
  if (caption) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
    ),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

/**
 * Arquivo enviado pelo atendente: WhatsApp e Messenger sobem o arquivo e
 * mandam pelo id, Telegram manda no proprio pedido, Instagram e widget pelo
 * link publico assinado e temporario (so de arquivo de atendente).
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("arquivo enviado pelo atendente", () => {
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

  async function connect(t: Awaited<ReturnType<typeof fixture.createTenant>>, provider: string) {
    const payload =
      provider === "whatsapp"
        ? { phoneNumberId: "123456789", wabaId: "998877665544", accessToken: TOKEN }
        : provider === "telegram"
          ? { botToken: BOT_TOKEN }
          : provider === "instagram"
            ? { instagramAccountId: "5550001", pageId: "4440001", accessToken: TOKEN }
            : { pageId: "4440001", accessToken: TOKEN };
    const response = await app.inject({
      method: "POST",
      url: `${t.base}/channels/${provider}`,
      headers: { cookie: t.admin },
      payload: { name: provider, assistantId: t.assistantId, appSecret: APP_SECRET, ...payload },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  /** Cliente escreve pelo webhook do canal: abre a conversa e a janela. */
  async function customerWrites(provider: string, connectionId: string) {
    let body: string;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (provider === "telegram") {
      const setWebhook = fake.telegram.filter((c) => c.method === "setWebhook").at(-1)!;
      headers["x-telegram-bot-api-secret-token"] = setWebhook.body.secret_token as string;
      body = JSON.stringify({
        update_id: 1,
        message: { message_id: 10, chat: { id: 555, type: "private" }, text: "oi" },
      });
    } else if (provider === "whatsapp") {
      body = JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "123456789" },
                  contacts: [{ wa_id: "5511988887777", profile: { name: "Ana" } }],
                  messages: [
                    { id: "wamid.in.1", from: "5511988887777", type: "text", text: { body: "oi" } },
                  ],
                },
              },
            ],
          },
        ],
      });
      headers["x-hub-signature-256"] = sign(body);
    } else {
      const account = provider === "instagram" ? "5550001" : "4440001";
      body = JSON.stringify({
        entry: [
          {
            id: account,
            messaging: [{ sender: { id: `user-${provider}` }, message: { mid: `m-${provider}`, text: "oi" } }],
          },
        ],
      });
      headers["x-hub-signature-256"] = sign(body);
    }
    const response = await app.inject({
      method: "POST",
      url: `/webhooks/${provider}/${connectionId}`,
      headers,
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    await drainJobs();
    const conversation = await db
      .selectFrom("conversations")
      .select("id")
      .where("channel_connection_id", "=", connectionId)
      .executeTakeFirstOrThrow();
    return conversation.id;
  }

  const sendFile = (
    t: Awaited<ReturnType<typeof fixture.createTenant>>,
    conversationId: string,
    file: { name: string; type: string; data: Buffer },
    caption?: string,
    cookie = t.people.Atendente.cookie,
  ) => {
    const body = multipart(file, caption);
    return app.inject({
      method: "POST",
      url: `${t.base}/inbox/${conversationId}/files`,
      headers: { cookie, ...body.headers },
      payload: body.payload,
    });
  };

  beforeAll(async () => {
    fake = await startFakeGraphApi();
  });

  beforeEach(async () => {
    files.clear();
    fake.sent.length = 0;
    fake.metaMessages.length = 0;
    fake.telegram.length = 0;
    fake.uploads.length = 0;
    await channelMessagesQueue.obliterate({ force: true });
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await fixture.createMaster(app);
  });

  afterAll(async () => {
    await fake.close();
    await channelMessagesQueue.close();
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  it("whatsapp e telegram: sobem o arquivo e mandam com a legenda", async () => {
    const t = await fixture.createTenant(app, masterCookie, "envio-a");
    const whatsapp = await customerWrites("whatsapp", await connect(t, "whatsapp"));

    const sent = await sendFile(
      t,
      whatsapp,
      { name: "proposta.pdf", type: "application/pdf", data: PDF },
      "Segue a proposta",
    );
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({ content: "Segue a proposta", role: "atendente" });
    await drainJobs();

    expect(fake.uploads.find((u) => u.path === "/123456789/media")).toMatchObject({
      fileName: "proposta.pdf",
      mimeType: "application/pdf",
      size: PDF.length,
      fields: { messaging_product: "whatsapp", type: "application/pdf" },
    });
    const document = fake.sent.find((m) => m.body.type === "document")!;
    expect(document.body.document).toMatchObject({
      caption: "Segue a proposta",
      filename: "proposta.pdf",
    });
    const status = await db
      .selectFrom("messages")
      .select(["delivery_status"])
      .where("id", "=", sent.json().id)
      .executeTakeFirstOrThrow();
    expect(status.delivery_status).toBe("enviada");

    const telegram = await customerWrites("telegram", await connect(t, "telegram"));
    expect(
      (await sendFile(t, telegram, { name: "foto.png", type: "image/png", data: PNG }, "Olha"))
        .statusCode,
    ).toBe(201);
    await drainJobs();
    expect(fake.telegram.find((c) => c.method === "sendPhoto")?.body).toMatchObject({
      chat_id: "555",
      caption: "Olha",
      photo: "foto.png",
    });
  });

  it("messenger e instagram: anexo pelo id ou pelo link assinado", async () => {
    const t = await fixture.createTenant(app, masterCookie, "envio-b");
    const messenger = await customerWrites("messenger", await connect(t, "messenger"));
    fake.metaMessages.length = 0;
    await sendFile(
      t,
      messenger,
      { name: "contrato.pdf", type: "application/pdf", data: PDF },
      "Contrato",
    );
    await drainJobs();
    expect(fake.uploads.find((u) => u.path === "/4440001/message_attachments")).toMatchObject({
      fileName: "contrato.pdf",
      fileField: "filedata",
    });
    // Arquivo pelo attachment_id e, depois, a legenda como texto.
    expect(fake.metaMessages.map((m) => m.body.message)).toEqual([
      { attachment: { type: "file", payload: { attachment_id: expect.any(String) } } },
      { text: "Contrato" },
    ]);

    const t2 = await fixture.createTenant(app, masterCookie, "envio-c");
    const instagram = await customerWrites("instagram", await connect(t2, "instagram"));
    fake.metaMessages.length = 0;
    // O Instagram nao recebe documento.
    expect(
      (await sendFile(t2, instagram, { name: "x.pdf", type: "application/pdf", data: PDF }))
        .statusCode,
    ).toBe(422);
    await sendFile(t2, instagram, { name: "foto.png", type: "image/png", data: PNG });
    await drainJobs();
    const [image] = fake.metaMessages;
    expect(image.body.message.attachment?.type).toBe("image");
    const url = String(image.body.message.attachment?.payload.url);
    expect(url.startsWith("https://api.chatrag.test/media/")).toBe(true);

    // O link baixa o arquivo sem sessao; assinatura alterada nao.
    const path = url.slice("https://api.chatrag.test".length);
    const download = await app.inject({ method: "GET", url: path });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.equals(PNG)).toBe(true);
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    expect((await app.inject({ method: "GET", url: `${path}x` })).statusCode).toBe(404);
  });

  it("widget: tempo real com o link, regras de tipo e de papel", async () => {
    const t = await fixture.createTenant(app, masterCookie, "envio-d");
    const conversationId = (await fixture.startWidgetConversation(app, t.key)).json()
      .conversationId as string;

    expect(
      (
        await sendFile(t, conversationId, {
          name: "x.html",
          type: "text/html",
          data: Buffer.from("<script>"),
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await sendFile(
          t,
          conversationId,
          { name: "a.pdf", type: "application/pdf", data: PDF },
          undefined,
          t.people.Analista.cookie,
        )
      ).statusCode,
    ).toBe(403);

    const events: { kind: string; attachments?: { path: string; fileName: string }[] }[] = [];
    const unsubscribe = await realtime.subscribe(t.organizationId, (e) => events.push(e));
    const sent = await sendFile(t, conversationId, {
      name: "../../etc/guia.pdf",
      type: "application/pdf",
      data: PDF,
    });
    expect(sent.statusCode).toBe(201);
    for (let i = 0; i < 20 && !events.some((e) => e.kind === "agent_message"); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await unsubscribe();
    const event = events.find((e) => e.kind === "agent_message")!;
    // Nome sem caminho; o link baixa o arquivo como anexo.
    expect(event.attachments?.[0].fileName).toBe("guia.pdf");
    const download = await app.inject({ method: "GET", url: event.attachments![0].path });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-disposition"]).toMatch(/^attachment;/);

    // Arquivo recebido do cliente nunca sai pelo link publico.
    const visitorMessage = await db
      .insertInto("messages")
      .values({ conversation_id: conversationId, role: "visitante", content: "segue" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const { id } = await attachmentsService.register(
      t.organizationId,
      visitorMessage.id,
      "documento",
      "rg.pdf",
    );
    await attachmentsService.saveFile(t.organizationId, id, PDF, "application/pdf");
    expect(
      (await app.inject({ method: "GET", url: attachmentsService.linkPath(id) })).statusCode,
    ).toBe(404);
  });
});
