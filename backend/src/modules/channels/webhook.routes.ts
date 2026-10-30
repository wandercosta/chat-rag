import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ChannelProvider } from "../../db/types.js";
import { organizationsService } from "../organizations/index.js";
import { enqueueChannelJob } from "../../queue/channel-messages.queue.js";
import { connectionsRepository } from "./connections.repository.js";
import { providers, secretsOf } from "./providers.js";

const providerSchema = z.enum(["whatsapp", "messenger", "instagram", "telegram"]);
const paramsSchema = z.object({ provider: providerSchema, connectionId: z.string().uuid() });
const verifyQuerySchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.verify_token": z.string(),
  "hub.challenge": z.string(),
});

/** Conexao existente e do mesmo provedor da URL; senao, nada a fazer. */
async function connectionFor(params: unknown) {
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return null;
  const connection = await connectionsRepository.findByIdForWebhook(parsed.data.connectionId);
  return connection?.provider === parsed.data.provider ? connection : null;
}

/**
 * Webhooks publicos dos canais (ADR-006 #7): um endereco por conexao, e a
 * organizacao vem da conexao, nunca do corpo. Sem autenticacao do provedor
 * (assinatura da Meta ou token secreto do Telegram), nada e processado. O
 * trabalho vai para a fila, entao o provedor recebe o 200 logo.
 */
export async function channelsWebhookRoutes(app: FastifyInstance) {
  // Encapsulado neste plugin: so aqui o JSON chega cru, para conferir a
  // assinatura sobre os mesmos bytes que a Meta assinou.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    try {
      done(null, { raw: body as Buffer, json: JSON.parse((body as Buffer).toString("utf8")) });
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Verificacao que a Meta faz ao cadastrar a URL: devolve o challenge se o
  // token bate com o desta conexao. O Telegram nao usa.
  app.get("/webhooks/:provider/:connectionId", async (request, reply) => {
    const query = verifyQuerySchema.safeParse(request.query);
    const connection = await connectionFor(request.params);
    if (
      !query.success ||
      !connection ||
      connection.provider === "telegram" ||
      query.data["hub.verify_token"] !== connection.verify_token
    ) {
      return reply.code(403).send({ error: "verificacao recusada" });
    }
    return reply.type("text/plain").send(query.data["hub.challenge"]);
  });

  app.post("/webhooks/:provider/:connectionId", async (request, reply) => {
    const connection = await connectionFor(request.params);
    if (!connection) return reply.code(404).send({ error: "canal nao encontrado" });

    const provider = providers[connection.provider as ChannelProvider];
    const body = request.body as { raw: Buffer; json: unknown } | undefined;
    if (!body || !provider.authenticate(request.headers, body.raw, secretsOf(connection))) {
      return reply.code(401).send({ error: "autenticacao do provedor invalida" });
    }

    // Tenant suspenso nao atende, mas responde 200 para o provedor nao insistir.
    if (await organizationsService.isSuspended(connection.organization_id)) {
      return reply.code(200).send({ ok: true });
    }

    const parsed = provider.parse(body.json, connection);
    for (const message of parsed.messages) {
      await enqueueChannelJob({ kind: "inbound", connectionId: connection.id, message });
    }
    for (const status of parsed.statuses) {
      await enqueueChannelJob({ kind: "status", connectionId: connection.id, ...status });
    }
    return reply.code(200).send({ ok: true });
  });
}
