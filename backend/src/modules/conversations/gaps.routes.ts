import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { TopicNotFoundError } from "../knowledge/index.js";
import { GapNotFoundError, gapsService } from "./gaps.service.js";

const answerSchema = z.object({
  topicId: z.string().uuid(),
  content: z.string().min(1),
});

const roles = ["Administrador", "Editor de base"] as const;

export async function gapsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/gaps",
    { preHandler: requireOrgRole(["Administrador", "Analista"]) },
    async (request) => {
      return gapsService.list(request.params.organizationId);
    },
  );

  app.post<{ Params: { organizationId: string; gapId: string } }>(
    "/organizations/:organizationId/gaps/:gapId/resolve",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request) => {
      await gapsService.resolve(request.params.organizationId, request.params.gapId);
      return { ok: true };
    },
  );

  app.post<{ Params: { organizationId: string; gapId: string } }>(
    "/organizations/:organizationId/gaps/:gapId/answer",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = answerSchema.parse(request.body);
      try {
        const source = await gapsService.answer(
          request.auth!.userId,
          request.params.organizationId,
          request.params.gapId,
          body,
        );
        return reply.code(201).send(source);
      } catch (err) {
        if (err instanceof GapNotFoundError)
          return reply.code(404).send({ error: "lacuna nao encontrada" });
        if (err instanceof TopicNotFoundError)
          return reply.code(404).send({ error: "topico nao encontrado" });
        throw err;
      }
    },
  );
}
