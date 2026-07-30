import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { NoDomainsError, keysService } from "./keys.service.js";

const roles = ["Administrador"] as const;

const createSchema = z.object({
  assistantId: z.string().uuid(),
  environment: z.enum(["teste", "producao"]),
  domains: z.array(z.string().min(1)).min(1),
});

const domainSchema = z.object({ domain: z.string().min(1) });

export async function embedAdminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/widget-keys",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      return keysService.list(request.params.organizationId);
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/widget-keys",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      try {
        const key = await keysService.create(
          request.auth!.userId,
          request.params.organizationId,
          body.assistantId,
          body.environment,
          body.domains,
        );
        return reply.code(201).send(key);
      } catch (err) {
        if (err instanceof NoDomainsError) {
          return reply.code(422).send({ error: "ao menos um dominio permitido e obrigatorio" });
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { organizationId: string; keyId: string } }>(
    "/organizations/:organizationId/widget-keys/:keyId/revoke",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      await keysService.revoke(request.auth!.userId, request.params.organizationId, request.params.keyId);
      return { ok: true };
    },
  );

  app.post<{ Params: { organizationId: string; keyId: string } }>(
    "/organizations/:organizationId/widget-keys/:keyId/domains",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = domainSchema.parse(request.body);
      await keysService.addDomain(request.params.keyId, body.domain);
      return reply.code(201).send({ ok: true });
    },
  );

  app.delete<{ Params: { organizationId: string; keyId: string; domainId: string } }>(
    "/organizations/:organizationId/widget-keys/:keyId/domains/:domainId",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      await keysService.removeDomain(request.params.keyId, request.params.domainId);
      return { ok: true };
    },
  );
}
