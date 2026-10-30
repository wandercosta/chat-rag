import Fastify, { type FastifyInstance } from "fastify";

/** Porta fixa: META_GRAPH_URL aponta para ca em vitest.config.ts. */
export const FAKE_GRAPH_PORT = 4599;
export const BAD_TOKEN = "token-recusado-pela-meta-0000";
/** Token de bot que o Telegram simulado recusa. */
export const BAD_BOT_TOKEN = "100000:recusadorecusadorecusadorecusado00";

export interface SentMessage {
  phoneNumberId: string;
  body: {
    to: string;
    type: "text" | "template";
    text?: { body: string };
    template?: { name: string; language: { code: string }; components: unknown[] };
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
  body: { recipient: { id: string }; message: { text: string } };
}

/** Chamada a Bot API do Telegram simulada. */
export interface TelegramCall {
  token: string;
  method: string;
  body: Record<string, unknown>;
}

export async function startFakeGraphApi() {
  const sent: SentMessage[] = [];
  const metaMessages: MetaMessage[] = [];
  const telegram: TelegramCall[] = [];
  let counter = 0;
  const app: FastifyInstance = Fastify({ logger: false });

  const refuse = (auth?: string) => auth === `Bearer ${BAD_TOKEN}`;

  app.get<{ Params: { id: string }; Querystring: { fields?: string } }>(
    "/v21.0/:id",
    async (request, reply) => {
      if (refuse(request.headers.authorization)) {
        return reply.code(401).send({ error: { message: "Invalid OAuth access token" } });
      }
      if (request.query.fields === "name") return { name: "Pagina Teste" };
      if (request.query.fields === "username") return { username: "loja.teste" };
      return { display_phone_number: "+55 11 4000-0000", verified_name: "Loja Teste" };
    },
  );

  app.post<{ Params: { id: string }; Body: SentMessage["body"] | MetaMessage["body"] }>(
    "/v21.0/:id/messages",
    async (request, reply) => {
      // Messenger e Instagram: corpo com `recipient`, resposta com `message_id`.
      if ("recipient" in request.body) {
        metaMessages.push({ pageId: request.params.id, body: request.body });
        counter += 1;
        return { recipient_id: request.body.recipient.id, message_id: `m_out_${counter}` };
      }
      if (request.body.to === "5500000000000") {
        return reply.code(400).send({ error: { message: "Recipient phone number not valid" } });
      }
      sent.push({ phoneNumberId: request.params.id, body: request.body });
      counter += 1;
      return { messages: [{ id: `wamid.out.${counter}` }] };
    },
  );

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
      telegram.push({ token, method, body: request.body ?? {} });
      if (method === "getMe") return { ok: true, result: { id: 7001, username: "loja_bot" } };
      if (method === "sendMessage") {
        counter += 1;
        return { ok: true, result: { message_id: counter } };
      }
      return { ok: true, result: true };
    },
  );

  await app.listen({ port: FAKE_GRAPH_PORT, host: "127.0.0.1" });
  return { sent, metaMessages, telegram, close: () => app.close() };
}
