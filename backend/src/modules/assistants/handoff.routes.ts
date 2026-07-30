import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { handoffService } from "./handoff.service.js";

const roles = ["Administrador"] as const;

const createSchema = z.object({
  sectorName: z.string().min(1),
  phoneNumber: z.string().min(8),
});

export async function handoffRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string; assistantId: string } }>(
    "/organizations/:organizationId/assistants/:assistantId/handoff-configs",
    { preHandler: requireOrgRole([...roles, "Editor de base", "Analista"]) },
    async (request) => {
      return handoffService.list(request.params.assistantId);
    },
  );

  app.post<{ Params: { organizationId: string; assistantId: string } }>(
    "/organizations/:organizationId/assistants/:assistantId/handoff-configs",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      const config = await handoffService.create(
        request.auth!.userId,
        request.params.organizationId,
        request.params.assistantId,
        body.sectorName,
        body.phoneNumber,
      );
      return reply.code(201).send(config);
    },
  );

  app.delete<{ Params: { organizationId: string; assistantId: string; configId: string } }>(
    "/organizations/:organizationId/assistants/:assistantId/handoff-configs/:configId",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      await handoffService.remove(
        request.auth!.userId,
        request.params.organizationId,
        request.params.assistantId,
        request.params.configId,
      );
      return { ok: true };
    },
  );
}
