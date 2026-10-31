import type { FastifyReply, FastifyRequest } from "fastify";
import { redis } from "../../db/redis.js";
import { organizationsService } from "../organizations/index.js";
import { tokensService, type ApiScope, type ApiTokenContext } from "./tokens.service.js";

declare module "fastify" {
  interface FastifyRequest {
    apiToken: ApiTokenContext | null;
  }
}

/** Chamadas por minuto por token. */
export const API_RATE_LIMIT_PER_MINUTE = 120;

async function overRateLimit(tokenId: string, reply: FastifyReply): Promise<boolean> {
  const window = Math.floor(Date.now() / 60_000);
  const key = `api-rate:${tokenId}:${window}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 70);
  reply.header("X-RateLimit-Limit", API_RATE_LIMIT_PER_MINUTE);
  reply.header("X-RateLimit-Remaining", Math.max(0, API_RATE_LIMIT_PER_MINUTE - count));
  if (count <= API_RATE_LIMIT_PER_MINUTE) return false;
  reply.header("Retry-After", 60 - Math.floor((Date.now() / 1000) % 60));
  return true;
}

/**
 * `Authorization: Bearer crg_...`. O token ja carrega a organizacao: a API
 * publica nunca recebe organizationId de quem chama, entao um token nao tem
 * como enxergar outro tenant.
 */
export function requireApiScope(scope: ApiScope) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    const token = match ? await tokensService.authenticate(match[1]) : null;
    if (!token) return reply.code(401).send({ error: "token de API invalido ou revogado" });
    if (!token.scopes.includes(scope)) {
      return reply.code(403).send({ error: `o token nao tem o escopo ${scope}` });
    }
    if (await organizationsService.isSuspended(token.organizationId)) {
      return reply.code(403).send({ error: "organizacao suspensa" });
    }
    if (await overRateLimit(token.tokenId, reply)) {
      return reply.code(429).send({ error: "limite de chamadas por minuto atingido" });
    }
    request.apiToken = token;
  };
}
