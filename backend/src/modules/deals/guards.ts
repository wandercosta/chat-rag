import type { FastifyReply, FastifyRequest } from "fastify";
import { requireOrgRole } from "../identity/index.js";
import { DealsConflictError, DealsInvalidReferenceError, DealsNotFoundError } from "./errors.js";

export const readRoles = ["Administrador", "Atendente", "Analista"] as const;
export const writeRoles = ["Administrador", "Atendente"] as const;

/**
 * requireOrgRole deixa passar o Master com sessao de suporte (leitura). Nas
 * escritas o funil exige ser membro: o Master nao cria nem move negocio em
 * nome do tenant (ADR-008 #5).
 */
async function requireMember(
  request: FastifyRequest<{ Params: { organizationId?: string } }>,
  reply: FastifyReply,
) {
  const organizationId = request.params?.organizationId;
  if (!request.auth?.memberships.some((m) => m.organizationId === organizationId)) {
    return reply.code(403).send({ error: "so membros da organizacao alteram o funil" });
  }
}

export const canRead = { preHandler: requireOrgRole(readRoles) };
export const canWrite = { preHandler: [requireOrgRole(writeRoles), requireMember] };
export const canAdmin = { preHandler: [requireOrgRole(["Administrador"]), requireMember] };

export function handleDealsError(err: unknown, reply: FastifyReply) {
  if (err instanceof DealsNotFoundError) return reply.code(404).send({ error: "nao encontrado" });
  if (err instanceof DealsInvalidReferenceError) {
    return reply.code(422).send({ error: `${err.message} invalido para esta organizacao` });
  }
  if (err instanceof DealsConflictError) return reply.code(409).send({ error: err.message });
  throw err;
}
