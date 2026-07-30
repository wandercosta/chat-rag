import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMaster, requireOrgRole, requireSession } from "../identity/index.js";
import { aiCredentialsService } from "./ai-credentials.service.js";

const configureSchema = z.object({
  environment: z.enum(["teste", "producao", "ambos"]),
  apiKey: z.string().min(20),
});

const environmentParamSchema = z.object({ environment: z.enum(["teste", "producao", "ambos"]) });

export async function aiCredentialsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/ai-credentials",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request) => {
      return aiCredentialsService.getStatus(request.params.organizationId);
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/ai-credentials",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      const body = configureSchema.parse(request.body);
      const result = await aiCredentialsService.configure(
        request.auth!.userId,
        request.params.organizationId,
        body.environment,
        body.apiKey,
      );
      return reply.code(201).send(result);
    },
  );

  app.delete<{ Params: { organizationId: string; environment: string } }>(
    "/organizations/:organizationId/ai-credentials/:environment",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request) => {
      const { environment } = environmentParamSchema.parse(request.params);
      await aiCredentialsService.remove(request.auth!.userId, request.params.organizationId, environment);
      return { ok: true };
    },
  );

  // Suporte Master: so estado + remocao auditada, nunca o valor da chave
  // (docs/security/privacidade-e-acesso.md).
  app.get<{ Params: { organizationId: string } }>(
    "/master/tenants/:organizationId/ai-credentials",
    { preHandler: requireMaster },
    async (request) => {
      return aiCredentialsService.getStatus(request.params.organizationId);
    },
  );

  app.delete<{ Params: { organizationId: string; environment: string } }>(
    "/master/tenants/:organizationId/ai-credentials/:environment",
    { preHandler: requireMaster },
    async (request) => {
      const { environment } = environmentParamSchema.parse(request.params);
      await aiCredentialsService.remove(request.auth!.userId, request.params.organizationId, environment);
      return { ok: true };
    },
  );
}
