import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { RuleNotFoundError, automationsService } from "./automations.service.js";
import { ruleInputSchema } from "./rules.js";

type OrgParams = { Params: { organizationId: string } };
type ItemParams = { Params: { organizationId: string; id: string } };

const adminOnly = { preHandler: requireOrgRole(["Administrador"]) };
const readers = { preHandler: requireOrgRole(["Administrador", "Analista"]) };

function notFound(err: unknown, reply: FastifyReply) {
  if (err instanceof RuleNotFoundError)
    return reply.code(404).send({ error: "automacao nao encontrada" });
  throw err;
}

/** Automacoes (ADR-006 #4, etapa 7): regras em formulario, so administrador edita. */
export async function automationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/automations";

  app.get<OrgParams>(base, readers, async (request) =>
    automationsService.list(request.params.organizationId),
  );

  app.post<OrgParams>(base, adminOnly, async (request, reply) => {
    const input = ruleInputSchema.parse(request.body);
    const rule = await automationsService.create(
      request.auth!.userId,
      request.params.organizationId,
      input,
    );
    return reply.code(201).send(rule);
  });

  app.put<ItemParams>(`${base}/:id`, adminOnly, async (request, reply) => {
    const input = ruleInputSchema.parse(request.body);
    try {
      return await automationsService.update(
        request.auth!.userId,
        request.params.organizationId,
        request.params.id,
        input,
      );
    } catch (err) {
      return notFound(err, reply);
    }
  });

  app.post<ItemParams>(`${base}/:id/enabled`, adminOnly, async (request, reply) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    try {
      return await automationsService.setEnabled(
        request.auth!.userId,
        request.params.organizationId,
        request.params.id,
        enabled,
      );
    } catch (err) {
      return notFound(err, reply);
    }
  });

  app.delete<ItemParams>(`${base}/:id`, adminOnly, async (request, reply) => {
    try {
      await automationsService.remove(
        request.auth!.userId,
        request.params.organizationId,
        request.params.id,
      );
      return reply.code(204).send();
    } catch (err) {
      return notFound(err, reply);
    }
  });

  app.get<ItemParams>(`${base}/:id/runs`, readers, async (request, reply) => {
    try {
      return await automationsService.runs(request.params.organizationId, request.params.id);
    } catch (err) {
      return notFound(err, reply);
    }
  });
}
