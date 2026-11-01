import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";

/** Porta fixa: META_GRAPH_URL aponta para ca em vitest.config.ts. */
export const FAKE_GRAPH_PORT = 4599;
export const BAD_TOKEN = "token-recusado-pela-meta-0000";
/** Token de bot que o Telegram simulado recusa. */
export const BAD_BOT_TOKEN = "100000:recusadorecusadorecusadorecusado00";

export interface SentMessage {
  phoneNumberId: string;
  body: {
    to: string;
    type: string;
    text?: { body: string };
    template?: { name: string; language: { code: string }; components: unknown[] };
    image?: Record<string, unknown>;
    document?: Record<string, unknown>;
    audio?: Record<string, unknown>;
    video?: Record<string, unknown>;
  };
}

/**
 * WhatsApp Cloud API falsa, so com o que o produto usa: dados do numero,
 * envio de mensagem e lista de modelos. Guarda o que foi enviado para o teste
 * conferir o que chegaria ao cliente.
 */
/** Mensagem enviada pelo Messenger/Instagram (POST /{pagina}/messages). */
export interface MetaMessage {
  pageId: string;
  body: {
    recipient: { id: string };
    messaging_type: string;
    tag?: string;
    message: { text?: string; attachment?: { type: string; payload: Record<string, unknown> } };
  };
}

/** Chamada a Bot API do Telegram simulada. */
export interface TelegramCall {
  token: string;
  method: string;
  body: Record<string, unknown>;
}

/** Arquivo recebido por upload multipart (WhatsApp, Messenger ou Telegram). */
export interface FakeUpload {
  path: string;
  fields: Record<string, string>;
  fileField: string;
  fileName: string;
  mimeType: string;
  size: number;
}

/** Campos e o arquivo de um pedido multipart, para o teste conferir. */
async function readMultipart(request: FastifyRequest, path: string): Promise<FakeUpload> {
  const upload: FakeUpload = {
    path,
    fields: {},
    fileField: "",
    fileName: "",
    mimeType: "",
    size: 0,
  };
  for await (const part of request.parts()) {
    if (part.type === "file") {
      const data = await part.toBuffer();
      Object.assign(upload, {
        fileField: part.fieldname,
        fileName: part.filename,
        mimeType: part.mimetype,
        size: data.length,
      });
    } else {
      upload.fields[part.fieldname] = String(part.value);
    }
  }
  return upload;
}

/** Arquivos que o provedor simulado serve; "grande" passa do teto dos testes. */
export const FAKE_FILES: Record<string, { body: Buffer; type: string }> = {
  "foto.jpg": { body: Buffer.from("conteudo-da-foto"), type: "image/jpeg" },
  "nota.pdf": { body: Buffer.from("%PDF-1.4 conteudo"), type: "application/pdf" },
  grande: { body: Buffer.alloc(8192, 1), type: "video/mp4" },
};

export async function startFakeGraphApi(options: { idPrefix?: string } = {}) {
  // Testes usam os ids fixos (wamid.out.1...); quem roda a API simulada a mao
  // contra um banco que ja tem mensagens passa um prefixo unico.
  const idPrefix = options.idPrefix ?? "";
  const sent: SentMessage[] = [];
  const metaMessages: MetaMessage[] = [];
  const telegram: TelegramCall[] = [];
  /** Contas (WABA) que assinaram os webhooks do app da plataforma. */
  const subscribedApps: string[] = [];
  /** Arquivos enviados pelos atendentes (upload multipart). */
  const uploads: FakeUpload[] = [];
  let counter = 0;
  const app: FastifyInstance = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  const refuse = (auth?: string) => auth === `Bearer ${BAD_TOKEN}`;
  const base = `http://127.0.0.1:${FAKE_GRAPH_PORT}`;

  // Arquivo de midia. No WhatsApp a URL exige o token; no CDN, nao.
  app.get<{ Params: { name: string } }>("/files/:name", async (request, reply) => {
    const file = FAKE_FILES[request.params.name];
    if (!file) return reply.code(404).send();
    return reply.type(file.type).send(file.body);
  });
  app.get<{ Params: { name: string } }>("/wa-files/:name", async (request, reply) => {
    const file = FAKE_FILES[request.params.name];
    if (!file || !request.headers.authorization?.startsWith("Bearer ")) {
      return reply.code(401).send();
    }
    return reply.type(file.type).send(file.body);
  });
  app.get<{ Params: { token: string; name: string } }>(
    "/file/bot:token/docs/:name",
    async (request, reply) => {
      const file = FAKE_FILES[request.params.name];
      if (!file) return reply.code(404).send();
      return reply.type(file.type).send(file.body);
    },
  );

  app.get<{ Params: { id: string }; Querystring: { fields?: string } }>(
    "/v21.0/:id",
    async (request, reply) => {
      if (refuse(request.headers.authorization)) {
        return reply.code(401).send({ error: { message: "Invalid OAuth access token" } });
      }
      // Midia do WhatsApp: "media.<arquivo>" devolve a URL curta para baixar.
      if (request.params.id.startsWith("media.")) {
        const name = request.params.id.slice("media.".length);
        return { url: `${base}/wa-files/${name}`, mime_type: FAKE_FILES[name]?.type };
      }
      // API de perfil (Messenger) e do usuario (Instagram).
      if (request.query.fields === "first_name,last_name") {
        return { first_name: "Carla", last_name: "Souza" };
      }
      if (request.query.fields === "name,username") return { name: "Duda Lima", username: "duda" };
      if (request.query.fields === "name") return { name: "Pagina Teste" };
      if (request.query.fields === "username") return { username: "loja.teste" };
      return { display_phone_number: "+55 11 4000-0000", verified_name: "Loja Teste" };
    },
  );

  // Cadastro integrado: troca do code pelo token e assinatura dos webhooks da conta.
  app.get<{ Querystring: { code?: string; client_secret?: string } }>(
    "/v21.0/oauth/access_token",
    async (request, reply) => {
      if (request.query.code !== "code-valido") {
        return reply.code(400).send({ error: { message: "Invalid verification code" } });
      }
      return { access_token: "EAAtokendocadastrointegrado1234567" };
    },
  );
  app.post<{ Params: { waba: string } }>("/v21.0/:waba/subscribed_apps", async (request) => {
    subscribedApps.push(request.params.waba);
    return { success: true };
  });

  app.post<{ Params: { id: string }; Body: SentMessage["body"] | MetaMessage["body"] }>(
    "/v21.0/:id/messages",
    async (request, reply) => {
      // Messenger e Instagram: corpo com `recipient`, resposta com `message_id`.
      if ("recipient" in request.body) {
        metaMessages.push({ pageId: request.params.id, body: request.body });
        counter += 1;
        return {
          recipient_id: request.body.recipient.id,
          message_id: `${idPrefix}m_out_${counter}`,
        };
      }
      if (request.body.to === "5500000000000") {
        return reply.code(400).send({ error: { message: "Recipient phone number not valid" } });
      }
      sent.push({ phoneNumberId: request.params.id, body: request.body });
      counter += 1;
      return { messages: [{ id: `${idPrefix}wamid.out.${counter}` }] };
    },
  );

  // WhatsApp: upload do arquivo que depois vai na mensagem pelo id.
  app.post<{ Params: { id: string } }>("/v21.0/:id/media", async (request) => {
    uploads.push(await readMultipart(request, `/${request.params.id}/media`));
    counter += 1;
    return { id: `${idPrefix}media.out.${counter}` };
  });

  // Messenger: upload do anexo que depois vai na mensagem pelo attachment_id.
  app.post<{ Params: { id: string } }>("/v21.0/:id/message_attachments", async (request) => {
    uploads.push(await readMultipart(request, `/${request.params.id}/message_attachments`));
    counter += 1;
    return { attachment_id: `${idPrefix}att.${counter}` };
  });

  app.get("/v21.0/:waba/message_templates", async () => ({
    data: [
      {
        name: "retomada",
        language: "pt_BR",
        status: "APPROVED",
        category: "UTILITY",
        components: [{ type: "BODY", text: "Oi {{1}}, podemos continuar o atendimento?" }],
      },
      {
        name: "promocao",
        language: "pt_BR",
        status: "PENDING",
        category: "MARKETING",
        components: [{ type: "BODY", text: "Oferta" }],
      },
    ],
  }));

  // Bot API do Telegram: POST /bot<token>/<metodo>.
  app.post<{ Params: { token: string; method: string }; Body: Record<string, unknown> }>(
    "/bot:token/:method",
    async (request, reply) => {
      const { token, method } = request.params;
      if (token === BAD_BOT_TOKEN) {
        return reply.code(401).send({ ok: false, description: "Unauthorized" });
      }
      if (request.isMultipart()) {
        const upload = await readMultipart(request, method);
        uploads.push(upload);
        telegram.push({
          token,
          method,
          body: { ...upload.fields, [upload.fileField]: upload.fileName },
        });
        counter += 1;
        return { ok: true, result: { message_id: counter } };
      }
      telegram.push({ token, method, body: request.body ?? {} });
      if (method === "getMe") return { ok: true, result: { id: 7001, username: "loja_bot" } };
      if (method === "getFile") {
        return { ok: true, result: { file_path: `docs/${String(request.body.file_id)}` } };
      }
      if (method === "sendMessage") {
        counter += 1;
        return { ok: true, result: { message_id: counter } };
      }
      return { ok: true, result: true };
    },
  );

  await app.listen({ port: FAKE_GRAPH_PORT, host: "127.0.0.1" });
  return { sent, metaMessages, telegram, subscribedApps, uploads, close: () => app.close() };
}
