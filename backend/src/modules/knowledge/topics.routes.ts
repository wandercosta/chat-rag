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

const updateSchema = z.object({
  name: z.string().min(2).optional(),
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

  app.patch<{ Params: { organizationId: string; topicId: string } }>(
    "/organizations/:organizationId/topics/:topicId",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = updateSchema.parse(request.body);
      const topic = await topicsRepository.update(
        request.params.organizationId,
        request.params.topicId,
        body,
      );
      if (!topic) return reply.code(404).send({ error: "topico nao encontrado" });
      return topic;
    },
  );
}
