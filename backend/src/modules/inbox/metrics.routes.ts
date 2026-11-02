import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { agentMetrics } from "./metrics.service.js";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

/** Desempenho por atendente (etapa 8): quem gere a equipe ve, quem atende nao. */
export async function agentMetricsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/agent-metrics",
    { preHandler: requireOrgRole(["Administrador", "Analista"]) },
    async (request) => {
      const { days } = querySchema.parse(request.query);
      return agentMetrics(request.params.organizationId, days);
    },
  );
}
