import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { WEBHOOK_EVENTS } from "./events.js";
import { UnsafeWebhookUrlError } from "./url-guard.js";
import { TooManyWebhooksError, WebhookNotFoundError, webhooksService } from "./webhooks.service.js";

const eventsSchema = z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length);
const createSchema = z.object({ url: z.string().trim().max(2000), events: eventsSchema });
const updateSchema = z.object({
  url: z.string().trim().max(2000).optional(),
  events: eventsSchema.optional(),
  enabled: z.boolean().optional(),
});

type OrgParams = { Params: { organizationId: string } };
type WebhookParams = { Params: { organizationId: string; webhookId: string } };

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof WebhookNotFoundError) {
    return reply.code(404).send({ error: "webhook nao encontrado" });
  }
  if (err instanceof UnsafeWebhookUrlError) return reply.code(422).send({ error: err.message });
  if (err instanceof TooManyWebhooksError) {
    return reply.code(409).send({ error: "limite de 10 webhooks por organizacao" });
  }
  throw err;
}

/** Webhooks de saida (etapa 8): so o Administrador cadastra e ve as entregas. */
export async function webhooksRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const admin = { preHandler: requireOrgRole(["Administrador"]) };
  const base = "/organizations/:organizationId/webhooks";

  app.get<OrgParams>(base, admin, async (request) =>
    webhooksService.list(request.params.organizationId),
  );

  app.post<OrgParams>(base, admin, async (request, reply) => {
    const body = createSchema.parse(request.body);
    try {
      const created = await webhooksService.create(
        request.auth!.userId,
        request.params.organizationId,
        body,
      );
      return reply.code(201).send(created);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.patch<WebhookParams>(`${base}/:webhookId`, admin, async (request, reply) => {
    const body = updateSchema.parse(request.body);
    try {
      return await webhooksService.update(
        request.auth!.userId,
        request.params.organizationId,
        request.params.webhookId,
        body,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post<WebhookParams>(`${base}/:webhookId/rotate-secret`, admin, async (request, reply) => {
    try {
      return await webhooksService.rotateSecret(
        request.auth!.userId,
        request.params.organizationId,
        request.params.webhookId,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post<WebhookParams>(`${base}/:webhookId/test`, admin, async (request, reply) => {
    try {
      const delivery = await webhooksService.sendTest(
        request.params.organizationId,
        request.params.webhookId,
      );
      return reply.code(202).send(delivery);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get<WebhookParams>(`${base}/:webhookId/deliveries`, admin, async (request) =>
    webhooksService.listDeliveries(request.params.organizationId, request.params.webhookId),
  );

  app.delete<WebhookParams>(`${base}/:webhookId`, admin, async (request, reply) => {
    try {
      await webhooksService.remove(
        request.auth!.userId,
        request.params.organizationId,
        request.params.webhookId,
      );
      return reply.code(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
