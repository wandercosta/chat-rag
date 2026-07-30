import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { conversationsService } from "./conversations.service.js";

const readRoles = ["Administrador", "Analista"] as const;

const querySchema = z.object({
  assistantId: z.string().uuid().optional(),
  visitorId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const feedbackSchema = z.object({ rating: z.enum(["positivo", "negativo"]) });

export async function conversationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/conversations",
    { preHandler: requireOrgRole(readRoles) },
    async (request) => {
      const filters = querySchema.parse(request.query);
      return conversationsService.list(request.params.organizationId, filters);
    },
  );

  app.get<{ Params: { organizationId: string; conversationId: string } }>(
    "/organizations/:organizationId/conversations/:conversationId",
    { preHandler: requireOrgRole(readRoles) },
    async (request, reply) => {
      const conversation = await conversationsService.getWithMessages(
        request.params.organizationId,
        request.params.conversationId,
      );
      if (!conversation) return reply.code(404).send({ error: "conversa nao encontrada" });
      return conversation;
    },
  );

  app.post<{ Params: { organizationId: string; conversationId: string } }>(
    "/organizations/:organizationId/conversations/:conversationId/feedback",
    { preHandler: requireOrgRole(readRoles) },
    async (request) => {
      const body = feedbackSchema.parse(request.body);
      await conversationsService.recordFeedback(request.params.conversationId, body.rating);
      return { ok: true };
    },
  );
}
