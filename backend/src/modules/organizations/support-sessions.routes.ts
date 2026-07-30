import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMaster, requireSession, supportSessionsService } from "../identity/index.js";
import { auditService } from "../audit/index.js";

const startSchema = z.object({
  justification: z.string().min(10, "justificativa precisa de pelo menos 10 caracteres"),
  minutes: z.number().int().min(5).max(240).default(60),
});

export async function supportSessionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/master/tenants/:organizationId/support-sessions",
    { preHandler: requireMaster },
    async (request) => {
      return supportSessionsService.listForOrganization(request.params.organizationId);
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/master/tenants/:organizationId/support-sessions",
    { preHandler: requireMaster },
    async (request, reply) => {
      const body = startSchema.parse(request.body);
      const session = await supportSessionsService.start(
        request.auth!.userId,
        request.params.organizationId,
        body.justification,
        body.minutes,
      );

      await auditService.record({
        actorUserId: request.auth!.userId,
        organizationId: request.params.organizationId,
        action: "Iniciou acesso de suporte",
        type: "acesso",
        target: `expira em ${body.minutes} min · ${body.justification}`,
      });

      return reply.code(201).send(session);
    },
  );

  app.post<{ Params: { organizationId: string; sessionId: string } }>(
    "/master/tenants/:organizationId/support-sessions/:sessionId/end",
    { preHandler: requireMaster },
    async (request) => {
      await supportSessionsService.end(request.params.sessionId);

      await auditService.record({
        actorUserId: request.auth!.userId,
        organizationId: request.params.organizationId,
        action: "Encerrou acesso de suporte",
        type: "acesso",
        target: request.params.sessionId,
      });

      return { ok: true };
    },
  );
}
