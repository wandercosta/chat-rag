import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import {
  API_SCOPES,
  TokenNotFoundError,
  TooManyTokensError,
  tokensService,
} from "./tokens.service.js";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length),
});

type OrgParams = { Params: { organizationId: string } };

/** Tokens da API publica: so o Administrador cria, ve e revoga. */
export async function apiTokensRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const admin = { preHandler: requireOrgRole(["Administrador"]) };
  const base = "/organizations/:organizationId/api-tokens";

  app.get<OrgParams>(base, admin, async (request) =>
    tokensService.list(request.params.organizationId),
  );

  app.post<OrgParams>(base, admin, async (request, reply) => {
    const body = createSchema.parse(request.body);
    try {
      const created = await tokensService.create(
        request.auth!.userId,
        request.params.organizationId,
        body.name,
        [...new Set(body.scopes)],
      );
      return reply.code(201).send(created);
    } catch (err) {
      if (err instanceof TooManyTokensError) {
        return reply.code(409).send({ error: "limite de 20 tokens ativos por organizacao" });
      }
      throw err;
    }
  });

  app.delete<{ Params: { organizationId: string; tokenId: string } }>(
    `${base}/:tokenId`,
    admin,
    async (request, reply) => {
      try {
        await tokensService.revoke(
          request.auth!.userId,
          request.params.organizationId,
          request.params.tokenId,
        );
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof TokenNotFoundError) {
          return reply.code(404).send({ error: "token nao encontrado ou ja revogado" });
        }
        throw err;
      }
    },
  );
}
