import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  EmailAlreadyInOrganizationError,
  LastAdminError,
  MemberNotFoundError,
  membersService,
} from "./members.service.js";
import { requireOrgRole, requireSession } from "./plugin.js";

const roleSchema = z.enum(["Administrador", "Editor de base", "Analista"]);

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: roleSchema,
});

const updateRoleSchema = z.object({ role: roleSchema });

function handleError(err: unknown, reply: import("fastify").FastifyReply) {
  if (err instanceof EmailAlreadyInOrganizationError) {
    return reply.code(409).send({ error: "este e-mail ja tem acesso a esta organizacao" });
  }
  if (err instanceof MemberNotFoundError)
    return reply.code(404).send({ error: "membro nao encontrado" });
  if (err instanceof LastAdminError) {
    return reply.code(409).send({ error: "a organizacao precisa de ao menos um administrador" });
  }
  throw err;
}

export async function membersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/members",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request) => {
      return membersService.list(request.params.organizationId);
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/members",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      try {
        const member = await membersService.create(
          request.auth!.userId,
          request.params.organizationId,
          body,
        );
        return reply.code(201).send(member);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.patch<{ Params: { organizationId: string; membershipId: string } }>(
    "/organizations/:organizationId/members/:membershipId",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      const body = updateRoleSchema.parse(request.body);
      try {
        return await membersService.updateRole(
          request.auth!.userId,
          request.params.organizationId,
          request.params.membershipId,
          body.role,
        );
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.delete<{ Params: { organizationId: string; membershipId: string } }>(
    "/organizations/:organizationId/members/:membershipId",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      try {
        await membersService.remove(
          request.auth!.userId,
          request.params.organizationId,
          request.params.membershipId,
        );
        return { ok: true };
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
