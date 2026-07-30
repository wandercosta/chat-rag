import type { FastifyInstance } from "fastify";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { usageService } from "./usage.service.js";

export async function usageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/usage",
    { preHandler: requireOrgRole(["Administrador", "Analista"]) },
    async (request) => {
      return usageService.getSummary(request.params.organizationId);
    },
  );
}
