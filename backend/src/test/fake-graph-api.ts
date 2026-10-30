import Fastify, { type FastifyInstance } from "fastify";

/** Porta fixa: WHATSAPP_GRAPH_URL aponta para ca em vitest.config.ts. */
export const FAKE_GRAPH_PORT = 4599;
export const BAD_TOKEN = "token-recusado-pela-meta-0000";

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
export async function startFakeGraphApi() {
  const sent: SentMessage[] = [];
  let counter = 0;
  const app: FastifyInstance = Fastify({ logger: false });

  const refuse = (auth?: string) => auth === `Bearer ${BAD_TOKEN}`;

  app.get<{ Params: { id: string } }>("/v21.0/:id", async (request, reply) => {
    if (refuse(request.headers.authorization)) {
      return reply.code(401).send({ error: { message: "Invalid OAuth access token" } });
    }
    return { display_phone_number: "+55 11 4000-0000", verified_name: "Loja Teste" };
  });

  app.post<{ Params: { id: string }; Body: SentMessage["body"] }>(
    "/v21.0/:id/messages",
    async (request, reply) => {
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

  await app.listen({ port: FAKE_GRAPH_PORT, host: "127.0.0.1" });
  return { sent, close: () => app.close() };
}
