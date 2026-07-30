import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { topicsRepository } from "./topics.repository.js";

const roles = ["Administrador", "Editor de base"] as const;

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  collectionId: z.string().uuid().nullable().optional(),
});

export async function topicsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/topics",
    { preHandler: requireOrgRole([...roles, "Analista"]) },
    async (request) => {
      return topicsRepository.listForOrganization(request.params.organizationId);
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/topics",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      const topic = await topicsRepository.insert(
        request.params.organizationId,
        body.name,
        body.description ?? null,
        body.collectionId ?? null,
      );
      return reply.code(201).send(topic);
    },
  );
}
