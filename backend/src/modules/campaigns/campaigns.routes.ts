import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import {
  CampaignNotFoundError,
  CampaignStateError,
  CampaignValidationError,
  campaignsService,
} from "./campaigns.service.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  connectionId: z.string().uuid(),
  segmentId: z.string().uuid(),
  templateId: z.string().uuid().nullable().optional(),
  templateParams: z.array(z.string().max(500)).max(20).optional(),
  text: z.string().max(4000).nullable().optional(),
  ratePerMinute: z.number().int().min(1).max(600).optional(),
});
const previewSchema = z.object({ connectionId: z.string().uuid(), segmentId: z.string().uuid() });
const scheduleSchema = z.object({ at: z.string().datetime().optional() });

type OrgParams = { Params: { organizationId: string } };
type ItemParams = { Params: { organizationId: string; id: string } };

const adminOnly = { preHandler: requireOrgRole(["Administrador"]) };
const readers = { preHandler: requireOrgRole(["Administrador", "Analista"]) };

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof CampaignNotFoundError)
    return reply.code(404).send({ error: "campanha nao encontrada" });
  if (err instanceof CampaignValidationError) return reply.code(422).send({ error: err.message });
  if (err instanceof CampaignStateError)
    return reply.code(409).send({ error: "a campanha nao esta num estado que permita isso" });
  throw err;
}

/** Campanhas (ADR-006 #9, etapa 6): so administrador cria, agenda e cancela. */
export async function campaignsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/campaigns";

  app.get<OrgParams>(base, readers, async (request) =>
    campaignsService.list(request.params.organizationId),
  );

  app.post<OrgParams>(`${base}/preview`, adminOnly, async (request, reply) => {
    const body = previewSchema.parse(request.body);
    try {
      return await campaignsService.preview(
        request.params.organizationId,
        body.connectionId,
        body.segmentId,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post<OrgParams>(base, adminOnly, async (request, reply) => {
    const body = createSchema.parse(request.body);
    try {
      const campaign = await campaignsService.create(
        request.auth!.userId,
        request.params.organizationId,
        body,
      );
      return reply.code(201).send(campaign);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.get<ItemParams>(`${base}/:id`, readers, async (request, reply) => {
    const campaign = await campaignsService.get(request.params.organizationId, request.params.id);
    if (!campaign) return reply.code(404).send({ error: "campanha nao encontrada" });
    return campaign;
  });

  app.post<ItemParams>(`${base}/:id/schedule`, adminOnly, async (request, reply) => {
    const body = scheduleSchema.parse(request.body ?? {});
    try {
      return await campaignsService.schedule(
        request.auth!.userId,
        request.params.organizationId,
        request.params.id,
        body.at ? new Date(body.at) : undefined,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.post<ItemParams>(`${base}/:id/cancel`, adminOnly, async (request, reply) => {
    try {
      return await campaignsService.cancel(
        request.auth!.userId,
        request.params.organizationId,
        request.params.id,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
