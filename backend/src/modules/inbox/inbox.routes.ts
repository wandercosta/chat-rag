import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { realtime } from "../../realtime/events.js";
import { startSse } from "../../realtime/sse.js";
import {
  AssignedToAnotherUserError,
  ChannelNotSupportedError,
  ConversationNotFoundError,
  ForbiddenAssignmentError,
  InvalidAssigneeError,
  inboxService,
  type InboxActor,
} from "./inbox.service.js";

const readRoles = ["Administrador", "Atendente", "Analista"] as const;
const agentRoles = ["Administrador", "Atendente"] as const;

const listQuerySchema = z.object({
  view: z.enum(["fila", "minhas", "abertas", "resolvidas", "assistente"]).default("fila"),
});
const assignSchema = z.object({ userId: z.string().uuid().nullable() });
const statusSchema = z.object({ status: z.enum(["aberta", "pendente", "resolvida"]) });
const textSchema = z.object({ content: z.string().trim().min(1).max(4000) });

type ConversationParams = { Params: { organizationId: string; conversationId: string } };

/**
 * Quem age na conversa e sempre um membro da organizacao. O Master em sessao
 * de suporte passa pelo `requireOrgRole` para ler, mas nao responde nem
 * atribui conversas de um tenant em nome dele.
 */
function actorOf(request: FastifyRequest<ConversationParams>): InboxActor | null {
  const membership = request.auth?.memberships.find(
    (m) => m.organizationId === request.params.organizationId,
  );
  return membership ? { userId: request.auth!.userId, role: membership.role } : null;
}

function handleInboxError(err: unknown, reply: FastifyReply) {
  if (err instanceof ConversationNotFoundError)
    return reply.code(404).send({ error: "conversa nao encontrada" });
  if (err instanceof ChannelNotSupportedError)
    return reply.code(422).send({ error: "esta conversa nao recebe resposta humana" });
  if (err instanceof AssignedToAnotherUserError)
    return reply.code(409).send({ error: "conversa atribuida a outra pessoa" });
  if (err instanceof InvalidAssigneeError)
    return reply.code(422).send({ error: "essa pessoa nao atende conversas nesta organizacao" });
  if (err instanceof ForbiddenAssignmentError)
    return reply.code(403).send({ error: "so um administrador atribui conversas a outra pessoa" });
  throw err;
}

export async function inboxRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/inbox",
    { preHandler: requireOrgRole(readRoles) },
    async (request) => {
      const { view } = listQuerySchema.parse(request.query);
      return inboxService.list(request.params.organizationId, view, request.auth!.userId);
    },
  );

  // Tempo real do painel (ADR-006 #10): so avisos de que algo mudou; o painel
  // busca o detalhe pelas rotas normais, com as mesmas permissoes.
  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/inbox/events",
    { preHandler: requireOrgRole(readRoles) },
    async (request, reply) => {
      const stream = startSse(request, reply);
      const unsubscribe = await realtime.subscribe(request.params.organizationId, (event) => {
        if (event.kind === "conversation_changed") stream.send(event);
      });
      stream.onClose(unsubscribe);
    },
  );

  app.get<ConversationParams>(
    "/organizations/:organizationId/inbox/:conversationId",
    { preHandler: requireOrgRole(readRoles) },
    async (request, reply) => {
      const conversation = await inboxService.get(
        request.params.organizationId,
        request.params.conversationId,
      );
      if (!conversation) return reply.code(404).send({ error: "conversa nao encontrada" });
      return conversation;
    },
  );

  app.post<ConversationParams>(
    "/organizations/:organizationId/inbox/:conversationId/assign",
    { preHandler: requireOrgRole(agentRoles) },
    async (request, reply) => {
      const actor = actorOf(request);
      if (!actor) return reply.code(403).send({ error: "acesso de suporte nao atende conversas" });
      const body = assignSchema.parse(request.body);
      try {
        return await inboxService.assign(
          actor,
          request.params.organizationId,
          request.params.conversationId,
          body.userId,
        );
      } catch (err) {
        return handleInboxError(err, reply);
      }
    },
  );

  app.post<ConversationParams>(
    "/organizations/:organizationId/inbox/:conversationId/status",
    { preHandler: requireOrgRole(agentRoles) },
    async (request, reply) => {
      const actor = actorOf(request);
      if (!actor) return reply.code(403).send({ error: "acesso de suporte nao atende conversas" });
      const body = statusSchema.parse(request.body);
      try {
        return await inboxService.setStatus(
          actor,
          request.params.organizationId,
          request.params.conversationId,
          body.status,
        );
      } catch (err) {
        return handleInboxError(err, reply);
      }
    },
  );

  app.post<ConversationParams>(
    "/organizations/:organizationId/inbox/:conversationId/messages",
    { preHandler: requireOrgRole(agentRoles) },
    async (request, reply) => {
      const actor = actorOf(request);
      if (!actor) return reply.code(403).send({ error: "acesso de suporte nao atende conversas" });
      const body = textSchema.parse(request.body);
      try {
        const message = await inboxService.reply(
          actor,
          request.params.organizationId,
          request.params.conversationId,
          body.content,
        );
        return reply.code(201).send(message);
      } catch (err) {
        return handleInboxError(err, reply);
      }
    },
  );

  app.post<ConversationParams>(
    "/organizations/:organizationId/inbox/:conversationId/notes",
    { preHandler: requireOrgRole(agentRoles) },
    async (request, reply) => {
      const actor = actorOf(request);
      if (!actor) return reply.code(403).send({ error: "acesso de suporte nao atende conversas" });
      const body = textSchema.parse(request.body);
      try {
        const note = await inboxService.addNote(
          actor,
          request.params.organizationId,
          request.params.conversationId,
          body.content,
        );
        return reply.code(201).send(note);
      } catch (err) {
        return handleInboxError(err, reply);
      }
    },
  );
}
