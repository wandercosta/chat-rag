import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { organizationsService } from "../organizations/index.js";
import { enqueueChannelJob } from "../../queue/channel-messages.queue.js";
import { connectionsRepository } from "./connections.repository.js";
import { secretsOf } from "./connections.service.js";
import { parseWhatsAppWebhook, verifySignature } from "./whatsapp.webhook.js";

const verifyQuerySchema = z.object({
  "hub.mode": z.string(),
  "hub.verify_token": z.string(),
  "hub.challenge": z.string(),
});

/**
 * Webhook publico do WhatsApp (ADR-006 #7): um endereco por conexao, e a
 * organizacao vem da conexao, nunca do corpo. Sem assinatura valida do app do
 * tenant, nada e processado. O processamento vai para a fila, entao a Meta
 * recebe o 200 logo.
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
  // token bate com o desta conexao.
  app.get<{ Params: { connectionId: string } }>(
    "/webhooks/whatsapp/:connectionId",
    async (request, reply) => {
      const query = verifyQuerySchema.safeParse(request.query);
      if (!z.string().uuid().safeParse(request.params.connectionId).success || !query.success) {
        return reply.code(400).send({ error: "requisicao invalida" });
      }
      const connection = await connectionsRepository.findByIdForWebhook(
        request.params.connectionId,
      );
      if (
        !connection ||
        connection.provider !== "whatsapp" ||
        query.data["hub.mode"] !== "subscribe" ||
        query.data["hub.verify_token"] !== connection.verify_token
      ) {
        return reply.code(403).send({ error: "verificacao recusada" });
      }
      return reply.type("text/plain").send(query.data["hub.challenge"]);
    },
  );

  app.post<{ Params: { connectionId: string } }>(
    "/webhooks/whatsapp/:connectionId",
    async (request, reply) => {
      if (!z.string().uuid().safeParse(request.params.connectionId).success) {
        return reply.code(404).send({ error: "canal nao encontrado" });
      }
      const connection = await connectionsRepository.findByIdForWebhook(
        request.params.connectionId,
      );
      if (!connection || connection.provider !== "whatsapp") {
        return reply.code(404).send({ error: "canal nao encontrado" });
      }

      const body = request.body as { raw: Buffer; json: unknown } | undefined;
      const signature = request.headers["x-hub-signature-256"] as string | undefined;
      if (!body || !verifySignature(body.raw, signature, secretsOf(connection).appSecret)) {
        return reply.code(401).send({ error: "assinatura invalida" });
      }

      // Tenant suspenso nao atende, mas responde 200 para a Meta nao insistir.
      if (await organizationsService.isSuspended(connection.organization_id)) {
        return reply.code(200).send({ ok: true });
      }

      const parsed = parseWhatsAppWebhook(body.json, connection.external_id);
      for (const message of parsed.messages) {
        await enqueueChannelJob({ kind: "inbound", connectionId: connection.id, message });
      }
      for (const status of parsed.statuses) {
        await enqueueChannelJob({ kind: "status", connectionId: connection.id, ...status });
      }
      return reply.code(200).send({ ok: true });
    },
  );
}
