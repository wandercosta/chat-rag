import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { AssignedToAnotherUserError } from "../inbox/index.js";
import {
  AssistantNotFoundError,
  ConnectionCheckError,
  ConnectionNotFoundError,
  DuplicateConnectionError,
  connectionsService,
} from "./connections.service.js";
import {
  NotAChannelConversationError,
  TemplateNotFoundError,
  TemplateParamsError,
  sendTemplateFromPanel,
} from "./delivery.service.js";

const whatsappSchema = z.object({
  name: z.string().trim().min(1).max(80),
  assistantId: z.string().uuid(),
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/, "id numerico do numero na Meta"),
  wabaId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/, "id numerico da conta WhatsApp Business"),
  accessToken: z.string().trim().min(20).max(1000),
  appSecret: z.string().trim().min(8).max(200),
});
const templateSendSchema = z.object({
  templateId: z.string().uuid(),
  params: z.array(z.string().max(1000)).max(20).default([]),
});

type OrgParams = { Params: { organizationId: string } };
type ItemParams = { Params: { organizationId: string; id: string } };

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof AssistantNotFoundError)
    return reply.code(422).send({ error: "assistente nao encontrado" });
  if (err instanceof ConnectionNotFoundError)
    return reply.code(404).send({ error: "canal nao encontrado" });
  if (err instanceof DuplicateConnectionError)
    return reply.code(409).send({ error: "esse numero ja esta conectado" });
  if (err instanceof ConnectionCheckError)
    return reply.code(422).send({ error: `a Meta recusou: ${err.message}` });
  if (err instanceof TemplateNotFoundError)
    return reply.code(422).send({ error: "modelo nao encontrado ou nao aprovado neste numero" });
  if (err instanceof TemplateParamsError)
    return reply.code(422).send({ error: "preencha todas as variaveis do modelo" });
  if (err instanceof NotAChannelConversationError)
    return reply.code(422).send({ error: "esta conversa nao veio do WhatsApp" });
  if (err instanceof AssignedToAnotherUserError)
    return reply.code(409).send({ error: "conversa atribuida a outra pessoa" });
  throw err;
}

/** URL que o tenant cola no painel da Meta. */
function webhookUrl(request: FastifyRequest, connectionId: string) {
  const base = env.PUBLIC_API_URL ?? `${request.protocol}://${request.headers.host}`;
  return `${base}/webhooks/whatsapp/${connectionId}`;
}

export async function channelsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/channels";

  app.get<OrgParams>(base, { preHandler: requireOrgRole(["Administrador"]) }, async (request) => {
    const connections = await connectionsService.list(request.params.organizationId);
    return connections.map((c) => ({ ...c, webhookUrl: webhookUrl(request, c.id) }));
  });

  app.post<OrgParams>(
    `${base}/whatsapp`,
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      const body = whatsappSchema.parse(request.body);
      try {
        const connection = await connectionsService.createWhatsApp(
          request.auth!.userId,
          request.params.organizationId,
          body,
        );
        return reply
          .code(201)
          .send({ ...connection, webhookUrl: webhookUrl(request, connection.id) });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.post<ItemParams>(
    `${base}/:id/check`,
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      try {
        return await connectionsService.check(request.params.organizationId, request.params.id);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.delete<ItemParams>(
    `${base}/:id`,
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      try {
        await connectionsService.remove(
          request.auth!.userId,
          request.params.organizationId,
          request.params.id,
        );
        return reply.code(204).send();
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Quem atende precisa ver os modelos para usar fora da janela de 24 horas.
  app.get<ItemParams>(
    `${base}/:id/templates`,
    { preHandler: requireOrgRole(["Administrador", "Atendente"]) },
    async (request) =>
      connectionsService.listTemplates(request.params.organizationId, request.params.id),
  );

  app.post<ItemParams>(
    `${base}/:id/templates/sync`,
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      try {
        return await connectionsService.syncTemplates(
          request.auth!.userId,
          request.params.organizationId,
          request.params.id,
        );
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.post<{ Params: { organizationId: string; conversationId: string } }>(
    "/organizations/:organizationId/inbox/:conversationId/template",
    { preHandler: requireOrgRole(["Administrador", "Atendente"]) },
    async (request, reply) => {
      const membership = request.auth?.memberships.find(
        (m) => m.organizationId === request.params.organizationId,
      );
      if (!membership)
        return reply.code(403).send({ error: "acesso de suporte nao atende conversas" });
      const body = templateSendSchema.parse(request.body);
      try {
        const message = await sendTemplateFromPanel(
          { userId: request.auth!.userId, role: membership.role },
          request.params.organizationId,
          request.params.conversationId,
          body.templateId,
          body.params,
        );
        return reply.code(201).send(message);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
