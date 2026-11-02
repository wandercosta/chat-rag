import type { FastifyInstance } from "fastify";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { exportOrganization } from "./export.service.js";

/** Exportacao LGPD: so o administrador da propria organizacao, auditada. */
export async function privacyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/export",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      const data = await exportOrganization(request.auth!.userId, request.params.organizationId);
      const day = new Date().toISOString().slice(0, 10);
      return reply
        .header("Content-Type", "application/json; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="dados-${data.organization?.slug ?? "organizacao"}-${day}.json"`,
        )
        .send(JSON.stringify(data, null, 2));
    },
  );
}
