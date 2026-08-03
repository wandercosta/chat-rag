import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { env } from "../../config/env.js";
import { identityRoutes } from "./routes.js";
import { identityService } from "./service.js";
import { supportSessionsService } from "./support-sessions.service.js";
import type { TenantRole } from "../../db/types.js";

/**
 * fastify-plugin quebra o encapsulamento padrao do Fastify de proposito: sem
 * isso, o decorator `auth` e o hook `onRequest` ficariam presos ao contexto
 * filho criado por `app.register(identityPlugin)` e nunca alcancariam as
 * rotas de outros modulos (cada `app.register(xRoutes)` em server.ts cria seu
 * proprio contexto irmao). Bug real encontrado testando contra o backend de
 * verdade: todo guard (`requireSession`/`requireOrgRole`/`requireMaster`) fora
 * do proprio modulo identity falhava sempre com "sem sessao ativa", porque
 * `request.auth` nunca era preenchido para essas rotas.
 */
export const identityPlugin = fp(async function identityPlugin(app: FastifyInstance) {
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (request) => {
    const token = request.cookies[env.SESSION_COOKIE_NAME];
    request.auth = await identityService.resolveAuth(token);
  });

  await app.register(identityRoutes);
});

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
 *
 * Master NAO tem acesso livre aos dados operacionais de um tenant: precisa de
 * uma sessao de suporte ativa e auditada para aquela organizacao especifica
 * (ADR-001 #14) — sem isso, cai no mesmo 403 de quem nao tem membership.
 */
export function requireOrgRole(minRoles: readonly TenantRole[]) {
  return async function (
    request: FastifyRequest<{ Params: { organizationId?: string } }>,
    reply: FastifyReply,
  ) {
    const organizationId = request.params?.organizationId;
    if (!organizationId || organizationId === "null" || organizationId === "undefined") {
      return reply.code(400).send({ error: "organizationId inválido ou não informado" });
    }

    const membership = request.auth?.memberships.find((m) => m.organizationId === organizationId);

    if (!membership) {
      const isSupporting =
        request.auth?.isPlatform && organizationId
          ? await supportSessionsService.hasActive(request.auth.userId, organizationId)
          : false;
      if (!isSupporting) return reply.code(403).send({ error: "sem acesso a esta organizacao" });
      return;
    }
    if (!minRoles.includes(membership.role)) {
      return reply.code(403).send({ error: "papel insuficiente para esta acao" });
    }
  };
}

/** Para rotas Master que tocam dados/config de um tenant especifico fora do
 * padrao de papeis (ex.: status da credencial de IA em suporte). */
export async function requireMasterSupportSession(
  request: FastifyRequest<{ Params: { organizationId?: string } }>,
  reply: FastifyReply,
) {
  const organizationId = request.params?.organizationId;
  if (!request.auth?.isPlatform || !organizationId || organizationId === "null" || organizationId === "undefined") {
    return reply.code(403).send({ error: "acesso restrito ao Master" });
  }
  const active = await supportSessionsService.hasActive(request.auth.userId, organizationId);
  if (!active) {
    return reply.code(403).send({ error: "requer sessao de suporte ativa para esta organizacao" });
  }
}
