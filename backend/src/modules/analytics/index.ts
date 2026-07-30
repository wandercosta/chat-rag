import type { FastifyInstance } from "fastify";
import { requireSession } from "../identity/index.js";

/** Stub - agregados de uso, custo estimado e qualidade. Ver docs/observability/operacao.md. */
export async function analyticsRoutes(app: FastifyInstance) {
  app.get("/organizations/:organizationId/usage", { preHandler: requireSession }, async () => {
    return { items: [], note: "stub - contrato pendente" };
  });
}
