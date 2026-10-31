import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMaster, requireOrgRole, requireSession } from "../identity/index.js";
import { organizationsService } from "../organizations/index.js";
import { aiQuotaService } from "./ai-quota.service.js";

type Params = { Params: { organizationId: string } };

const limitSchema = z
  .object({
    mode: z.enum(["padrao", "personalizado", "sem_limite"]),
    tokens: z.number().int().positive().max(1_000_000_000_000).nullable().optional(),
  })
  .refine((b) => b.mode !== "personalizado" || !!b.tokens, {
    message: "limite personalizado exige tokens",
    path: ["tokens"],
  });

/** Teto mensal da IA da plataforma (ADR-007): o tenant ve, o Master define. */
export async function aiQuotaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<Params>(
    "/organizations/:organizationId/ai-quota",
    { preHandler: requireOrgRole(["Administrador", "Analista"]) },
    async (request) => aiQuotaService.get(request.params.organizationId),
  );

  // So contagens: nao exige sessao de suporte.
  app.get<Params>(
    "/master/tenants/:organizationId/ai-quota",
    { preHandler: requireMaster },
    async (request) => aiQuotaService.get(request.params.organizationId),
  );

  app.put<Params>(
    "/master/tenants/:organizationId/ai-limit",
    { preHandler: requireMaster },
    async (request, reply) => {
      const body = limitSchema.parse(request.body);
      const updated = await organizationsService.setAiLimit(
        request.auth!.userId,
        request.params.organizationId,
        body.mode,
        body.tokens ?? null,
      );
      if (!updated) return reply.code(404).send({ error: "organizacao nao encontrada" });
      return aiQuotaService.get(request.params.organizationId);
    },
  );
}
