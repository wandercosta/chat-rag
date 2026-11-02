import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireSession } from "../identity/index.js";
import { realtime } from "../../realtime/events.js";
import { startSse } from "../../realtime/sse.js";
import { InvalidPeerError, ThreadNotFoundError, teamChatService } from "./team-chat.service.js";

type OrgParams = { Params: { organizationId: string } };
type ThreadParams = { Params: { organizationId: string; threadId: string } };

const directSchema = z.object({ userId: z.string().uuid() });
const messageSchema = z.object({ content: z.string().trim().min(1).max(4000) });
const listQuerySchema = z.object({ before: z.coerce.date().optional() });
const threadIdSchema = z.string().uuid();

/**
 * Qualquer papel do tenant usa o chat, mas so quem e membro: diferente de
 * requireOrgRole, sessao de suporte do Master nao abre conversa entre colegas.
 */
async function requireMember(
  request: FastifyRequest<{ Params: { organizationId?: string } }>,
  reply: FastifyReply,
) {
  const organizationId = request.params?.organizationId;
  const member = request.auth?.memberships.some((m) => m.organizationId === organizationId);
  if (!member) return reply.code(403).send({ error: "so membros da organizacao usam o chat" });
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof ThreadNotFoundError) {
    return reply.code(404).send({ error: "conversa nao encontrada" });
  }
  if (err instanceof InvalidPeerError) {
    return reply.code(400).send({ error: "essa pessoa nao faz parte da organizacao" });
  }
  throw err;
}

export async function teamChatRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/team-chat";

  app.get<OrgParams>(`${base}/people`, { preHandler: requireMember }, async (request) =>
    teamChatService.people(request.params.organizationId, request.auth!.userId),
  );

  app.get<OrgParams>(`${base}/threads`, { preHandler: requireMember }, async (request) =>
    teamChatService.listThreads(request.params.organizationId, request.auth!.userId),
  );

  app.post<OrgParams>(`${base}/direct`, { preHandler: requireMember }, async (request, reply) => {
    const body = directSchema.parse(request.body);
    try {
      return await teamChatService.openDirect(
        request.params.organizationId,
        request.auth!.userId,
        body.userId,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get<ThreadParams>(
    `${base}/threads/:threadId/messages`,
    { preHandler: requireMember },
    async (request, reply) => {
      if (!threadIdSchema.safeParse(request.params.threadId).success) {
        return reply.code(404).send({ error: "conversa nao encontrada" });
      }
      const { before } = listQuerySchema.parse(request.query);
      try {
        return await teamChatService.messages(
          request.params.organizationId,
          request.auth!.userId,
          request.params.threadId,
          before,
        );
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.post<ThreadParams>(
    `${base}/threads/:threadId/messages`,
    { preHandler: requireMember },
    async (request, reply) => {
      if (!threadIdSchema.safeParse(request.params.threadId).success) {
        return reply.code(404).send({ error: "conversa nao encontrada" });
      }
      const body = messageSchema.parse(request.body);
      try {
        const message = await teamChatService.send(
          request.params.organizationId,
          request.auth!.userId,
          request.params.threadId,
          body.content,
        );
        return reply.code(201).send(message);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // SSE so com ids: o painel recarrega as threads e a conversa aberta.
  app.get<OrgParams>(`${base}/events`, { preHandler: requireMember }, async (request, reply) => {
    const me = request.auth!.userId;
    const stream = startSse(request, reply);
    const unsubscribe = await realtime.subscribe(request.params.organizationId, (event) => {
      if (event.kind !== "team_message") return;
      if (event.participants && !event.participants.includes(me)) return;
      stream.send({ kind: event.kind, threadId: event.threadId, authorUserId: event.authorUserId });
    });
    stream.onClose(unsubscribe);
  });
}
