import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { collectionsRepository } from "./collections.repository.js";

const roles = ["Administrador", "Editor de base"] as const;

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  requiresReview: z.boolean().optional(),
});

export async function collectionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/collections",
    { preHandler: requireOrgRole([...roles, "Analista"]) },
    async (request) => {
      return collectionsRepository.listForOrganization(request.params.organizationId);
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/collections",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      const collection = await collectionsRepository.insert(
        request.params.organizationId,
        body.name,
        body.description ?? null,
        body.requiresReview ?? false,
      );
      return reply.code(201).send(collection);
    },
  );

  app.get<{ Params: { organizationId: string; assistantId: string } }>(
    "/organizations/:organizationId/assistants/:assistantId/collections",
    { preHandler: requireOrgRole([...roles, "Analista"]) },
    async (request) => {
      return collectionsRepository.listForAssistant(request.params.assistantId);
    },
  );

  app.put<{ Params: { organizationId: string; assistantId: string; collectionId: string } }>(
    "/organizations/:organizationId/assistants/:assistantId/collections/:collectionId",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      await collectionsRepository.linkAssistant(request.params.assistantId, request.params.collectionId);
      return { ok: true };
    },
  );

  app.delete<{ Params: { organizationId: string; assistantId: string; collectionId: string } }>(
    "/organizations/:organizationId/assistants/:assistantId/collections/:collectionId",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      await collectionsRepository.unlinkAssistant(request.params.assistantId, request.params.collectionId);
      return { ok: true };
    },
  );
}
