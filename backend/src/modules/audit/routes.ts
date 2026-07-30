import type { FastifyInstance } from "fastify";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { auditService } from "./service.js";

export async function auditRoutes(app: FastifyInstance) {
  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/audit",
    { preHandler: [requireSession, requireOrgRole(["Administrador"])] },
    async (request) => {
      return auditService.listForOrganization(request.params.organizationId);
    },
  );
}
