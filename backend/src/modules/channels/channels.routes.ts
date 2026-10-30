import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import type { ChannelProvider } from "../../db/types.js";
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

const metaId = (what: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{5,30}$/, `id numerico ${what}`);
const common = {
  name: z.string().trim().min(1).max(80),
  assistantId: z.string().uuid(),
};
const metaSecrets = {
  accessToken: z.string().trim().min(20).max(1000),
  appSecret: z.string().trim().min(8).max(200),
};

/** Um corpo por provedor; `provider` vem da URL. */
const connectSchemas = {
  whatsapp: z.object({
    ...common,
    ...metaSecrets,
    phoneNumberId: metaId("do numero na Meta"),
    wabaId: metaId("da conta WhatsApp Business"),
  }),
  messenger: z.object({ ...common, ...metaSecrets, pageId: metaId("da Pagina") }),
  instagram: z.object({
    ...common,
    ...metaSecrets,
    instagramAccountId: metaId("da conta profissional do Instagram"),
    pageId: metaId("da Pagina ligada ao Instagram"),
  }),
  telegram: z.object({
    ...common,
    botToken: z
      .string()
      .trim()
      .regex(/^\d{5,15}:[\w-]{30,60}$/, "token no formato do BotFather (123456:ABC...)"),
  }),
};

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
    return reply.code(409).send({ error: "essa conta ja esta conectada" });
  if (err instanceof ConnectionCheckError)
    return reply.code(422).send({ error: `o provedor recusou: ${err.message}` });
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

/** URL que vai para o provedor (colada na Meta; registrada sozinha no Telegram). */
function webhookUrlBuilder(request: FastifyRequest, provider: ChannelProvider) {
  const base = env.PUBLIC_API_URL ?? `${request.protocol}://${request.headers.host}`;
  return (connectionId: string) => `${base}/webhooks/${provider}/${connectionId}`;
}

export async function channelsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/channels";
  const adminOnly = { preHandler: requireOrgRole(["Administrador"]) };

  app.get<OrgParams>(base, adminOnly, async (request) => {
    const connections = await connectionsService.list(request.params.organizationId);
    return connections.map((c) => ({
      ...c,
      webhookUrl: webhookUrlBuilder(request, c.provider)(c.id),
    }));
  });

  for (const provider of Object.keys(connectSchemas) as ChannelProvider[]) {
    app.post<OrgParams>(`${base}/${provider}`, adminOnly, async (request, reply) => {
      const body = connectSchemas[provider].parse(request.body);
      const webhookUrlFor = webhookUrlBuilder(request, provider);
      try {
        const connection = await connectionsService.create(
          request.auth!.userId,
          request.params.organizationId,
          { ...body, provider } as Parameters<typeof connectionsService.create>[2],
          webhookUrlFor,
        );
        return reply.code(201).send({ ...connection, webhookUrl: webhookUrlFor(connection.id) });
      } catch (err) {
        return handleError(err, reply);
      }
    });
  }

  app.patch<ItemParams>(`${base}/:id`, adminOnly, async (request, reply) => {
    const body = z.object({ humanAgentTag: z.boolean() }).parse(request.body);
    try {
      return await connectionsService.setHumanAgentTag(
        request.auth!.userId,
        request.params.organizationId,
        request.params.id,
        body.humanAgentTag,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post<ItemParams>(`${base}/:id/check`, adminOnly, async (request, reply) => {
    try {
      const connections = await connectionsService.list(request.params.organizationId);
      const provider = connections.find((c) => c.id === request.params.id)?.provider;
      if (!provider) throw new ConnectionNotFoundError();
      return await connectionsService.check(
        request.params.organizationId,
        request.params.id,
        webhookUrlBuilder(request, provider),
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.delete<ItemParams>(`${base}/:id`, adminOnly, async (request, reply) => {
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
  });

  // Quem atende precisa ver os modelos para usar fora da janela de 24 horas.
  app.get<ItemParams>(
    `${base}/:id/templates`,
    { preHandler: requireOrgRole(["Administrador", "Atendente"]) },
    async (request) =>
      connectionsService.listTemplates(request.params.organizationId, request.params.id),
  );

  app.post<ItemParams>(`${base}/:id/templates/sync`, adminOnly, async (request, reply) => {
    try {
      return await connectionsService.syncTemplates(
        request.auth!.userId,
        request.params.organizationId,
        request.params.id,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

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
