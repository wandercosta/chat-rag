import type { FastifyInstance } from "fastify";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { gapsService } from "./gaps.service.js";

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
}
