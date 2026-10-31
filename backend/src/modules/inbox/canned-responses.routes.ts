import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { DuplicateTitleError, cannedResponsesService } from "./canned-responses.service.js";

const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(4000),
});

export async function cannedResponsesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/canned-responses",
    { preHandler: requireOrgRole(["Administrador", "Atendente"]) },
    async (request) => cannedResponsesService.list(request.params.organizationId),
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/canned-responses",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      try {
        const created = await cannedResponsesService.create(
          request.auth!.userId,
          request.params.organizationId,
          body.title,
          body.content,
        );
        return reply.code(201).send(created);
      } catch (err) {
        if (err instanceof DuplicateTitleError) {
          return reply.code(409).send({ error: "ja existe uma resposta pronta com esse titulo" });
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { organizationId: string; responseId: string } }>(
    "/organizations/:organizationId/canned-responses/:responseId",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      const removed = await cannedResponsesService.remove(
        request.auth!.userId,
        request.params.organizationId,
        request.params.responseId,
      );
      if (!removed) return reply.code(404).send({ error: "resposta pronta nao encontrada" });
      return reply.code(204).send();
    },
  );
}
