import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMaster, requireOrgRole, requireSession } from "../identity/index.js";
import { organizationsService } from "./service.js";

const createTenantSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "use apenas letras minusculas, numeros e hifen"),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

const statusSchema = z.object({ status: z.enum(["ativo", "suspenso"]) });
const retentionSchema = z.object({
  days: z.number().int().positive().nullable(),
  mode: z.enum(["excluir", "anonimizar"]).optional(),
});

export async function organizationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get("/master/tenants", { preHandler: requireMaster }, async () => {
    return organizationsService.listTenants();
  });

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId",
    { preHandler: requireOrgRole(["Administrador", "Editor de base", "Analista"]) },
    async (request, reply) => {
      const organization = await organizationsService.getById(request.params.organizationId);
      if (!organization) return reply.code(404).send({ error: "organizacao nao encontrada" });
      return organization;
    },
  );

  app.post("/master/tenants", { preHandler: requireMaster }, async (request, reply) => {
    const body = createTenantSchema.parse(request.body);
    const result = await organizationsService.createTenant(request.auth!.userId, body);
    return reply.code(201).send(result);
  });

  app.post<{ Params: { organizationId: string } }>(
    "/master/tenants/:organizationId/status",
    { preHandler: requireMaster },
    async (request) => {
      const body = statusSchema.parse(request.body);
      await organizationsService.setStatus(
        request.auth!.userId,
        request.params.organizationId,
        body.status,
      );
      return { ok: true };
    },
  );

  app.put<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/retention",
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request) => {
      const body = retentionSchema.parse(request.body);
      await organizationsService.setRetentionPolicy(
        request.auth!.userId,
        request.params.organizationId,
        body.days,
        body.mode,
      );
      return { ok: true };
    },
  );
}
