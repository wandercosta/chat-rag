import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import {
  DuplicateSectorError,
  InvalidSectorMemberError,
  SectorNotFoundError,
  sectorsService,
} from "./sectors.service.js";

const nameSchema = z.string().trim().min(1).max(60);
const updateSchema = z
  .object({
    name: nameSchema.optional(),
    memberIds: z.array(z.string().uuid()).max(200).optional(),
  })
  .refine((b) => b.name !== undefined || b.memberIds !== undefined, {
    message: "informe o nome ou quem atende",
  });

type OrgParams = { Params: { organizationId: string } };
type SectorParams = { Params: { organizationId: string; sectorId: string } };

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof SectorNotFoundError)
    return reply.code(404).send({ error: "setor nao encontrado" });
  if (err instanceof DuplicateSectorError)
    return reply.code(409).send({ error: "ja existe um setor com esse nome" });
  if (err instanceof InvalidSectorMemberError)
    return reply.code(422).send({ error: "so quem atende conversas pode entrar num setor" });
  throw err;
}

/** Setores da caixa de entrada. Quem atende ve a lista (para transferir); so o
 * Administrador cria, edita e exclui. */
export async function sectorsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/inbox-sectors";
  const adminOnly = { preHandler: requireOrgRole(["Administrador"]) };

  app.get<OrgParams>(
    base,
    { preHandler: requireOrgRole(["Administrador", "Atendente", "Analista"]) },
    async (request) => sectorsService.list(request.params.organizationId),
  );

  app.get<OrgParams>(
    "/organizations/:organizationId/inbox-agents",
    { preHandler: requireOrgRole(["Administrador", "Atendente"]) },
    async (request) => sectorsService.agents(request.params.organizationId),
  );

  app.post<OrgParams>(base, adminOnly, async (request, reply) => {
    const { name } = z.object({ name: nameSchema }).parse(request.body);
    try {
      const sector = await sectorsService.create(
        request.auth!.userId,
        request.params.organizationId,
        name,
      );
      return reply.code(201).send(sector);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.patch<SectorParams>(`${base}/:sectorId`, adminOnly, async (request, reply) => {
    const body = updateSchema.parse(request.body);
    try {
      return await sectorsService.update(
        request.auth!.userId,
        request.params.organizationId,
        z.string().uuid().parse(request.params.sectorId),
        body,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.delete<SectorParams>(`${base}/:sectorId`, adminOnly, async (request, reply) => {
    try {
      await sectorsService.remove(
        request.auth!.userId,
        request.params.organizationId,
        z.string().uuid().parse(request.params.sectorId),
      );
      return reply.code(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
