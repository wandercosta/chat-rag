import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSession } from "../identity/index.js";
import { dealsService } from "./deals.service.js";
import { canAdmin, canRead, canWrite, handleDealsError } from "./guards.js";

type OrgParams = { Params: { organizationId: string } };
type DealParams = { Params: { organizationId: string; dealId: string } };

const uuid = z.string().uuid();
const dealSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  valueCents: z.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
  contactId: uuid.nullable().optional(),
  ownerUserId: uuid.nullable().optional(),
  expectedCloseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD")
    .refine((d) => {
      const date = new Date(`${d}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(d);
    }, "data invalida")
    .nullable()
    .optional(),
});
const createSchema = dealSchema.extend({
  title: z.string().trim().min(1).max(200),
  pipelineId: uuid,
  stageId: uuid.optional(),
});
const moveSchema = z.object({
  stageId: uuid,
  position: z.number().int().min(0).optional(),
  lostReason: z.string().trim().max(500).nullable().optional(),
});
const listSchema = z.object({
  pipelineId: uuid.optional(),
  stageId: uuid.optional(),
  contactId: uuid.optional(),
  ownerUserId: uuid.optional(),
  status: z.enum(["aberto", "ganho", "perdido"]).optional(),
});

/** Negocios do funil (ADR-008): Administrador e Atendente escrevem, Analista le. */
export async function dealsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/deals";

  app.get<OrgParams>(base, canRead, async (request) =>
    dealsService.list(request.params.organizationId, listSchema.parse(request.query)),
  );

  app.get<DealParams>(`${base}/:dealId`, canRead, async (request, reply) => {
    if (!uuid.safeParse(request.params.dealId).success) return reply.code(404).send();
    try {
      return await dealsService.get(request.params.organizationId, request.params.dealId);
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });

  app.post<OrgParams>(base, canWrite, async (request, reply) => {
    const body = createSchema.parse(request.body);
    try {
      const deal = await dealsService.create(request.auth!.userId, request.params.organizationId, {
        ...body,
        // Sem responsavel informado, fica com quem criou.
        ownerUserId: body.ownerUserId === undefined ? request.auth!.userId : body.ownerUserId,
      });
      return reply.code(201).send(deal);
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });

  app.patch<DealParams>(`${base}/:dealId`, canWrite, async (request, reply) => {
    if (!uuid.safeParse(request.params.dealId).success) return reply.code(404).send();
    const body = dealSchema.parse(request.body);
    try {
      return await dealsService.update(
        request.auth!.userId,
        request.params.organizationId,
        request.params.dealId,
        body,
      );
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });

  app.post<DealParams>(`${base}/:dealId/move`, canWrite, async (request, reply) => {
    if (!uuid.safeParse(request.params.dealId).success) return reply.code(404).send();
    const body = moveSchema.parse(request.body);
    try {
      return await dealsService.move(
        request.auth!.userId,
        request.params.organizationId,
        request.params.dealId,
        body,
      );
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });

  app.delete<DealParams>(`${base}/:dealId`, canAdmin, async (request, reply) => {
    if (!uuid.safeParse(request.params.dealId).success) return reply.code(404).send();
    try {
      await dealsService.remove(
        request.auth!.userId,
        request.params.organizationId,
        request.params.dealId,
      );
      return reply.code(204).send();
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });
}
