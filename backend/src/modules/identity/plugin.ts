import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { identityRoutes } from "./routes.js";
import { identityService } from "./service.js";
import type { TenantRole } from "../../db/types.js";

export async function identityPlugin(app: FastifyInstance) {
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (request) => {
    const token = request.cookies[env.SESSION_COOKIE_NAME];
    request.auth = await identityService.resolveAuth(token);
  });

  await app.register(identityRoutes);
}

/** Bloqueia a rota se nao houver sessao valida. */
export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) {
    return reply.code(401).send({ error: "sem sessao ativa" });
  }
}

/** Bloqueia a rota se o usuario nao for Master (papel de plataforma). */
export async function requireMaster(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth?.isPlatform) {
    return reply.code(403).send({ error: "acesso restrito ao Master" });
  }
}

/**
 * Resolve o organization_id efetivo a partir da sessao (nunca de um parametro
 * livre enviado pelo cliente, ver docs/security/privacidade-e-acesso.md) e
 * confere se o papel do usuario naquela organizacao satisfaz o minimo exigido.
 */
export function requireOrgRole(minRoles: readonly TenantRole[]) {
  return async function (request: FastifyRequest<{ Params: { organizationId?: string } }>, reply: FastifyReply) {
    const organizationId = request.params?.organizationId;
    const membership = request.auth?.memberships.find((m) => m.organizationId === organizationId);

    if (!membership && !request.auth?.isPlatform) {
      return reply.code(403).send({ error: "sem acesso a esta organizacao" });
    }
    if (membership && !minRoles.includes(membership.role)) {
      return reply.code(403).send({ error: "papel insuficiente para esta acao" });
    }
  };
}
