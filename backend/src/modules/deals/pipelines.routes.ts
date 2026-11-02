import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSession } from "../identity/index.js";
import { canAdmin, canRead, handleDealsError } from "./guards.js";
import { pipelinesService } from "./pipelines.service.js";

type OrgParams = { Params: { organizationId: string } };
type PipelineParams = { Params: { organizationId: string; pipelineId: string } };
type StageParams = { Params: { organizationId: string; stageId: string } };

const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });
const stageSchema = nameSchema.extend({ kind: z.enum(["aberta", "ganho", "perdido"]) });
const orderSchema = z.object({ stageIds: z.array(z.string().uuid()).min(1).max(50) });
const uuid = z.string().uuid();

/** Funis e etapas (ADR-008 #2): todos leem, so o Administrador configura. */
export async function pipelinesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/pipelines";

  app.get<OrgParams>(base, canRead, async (request) => {
    const { organizationId } = request.params;
    const membership = request.auth?.memberships.find((m) => m.organizationId === organizationId);
    return pipelinesService.list(organizationId, {
      createDefault: membership?.role === "Administrador" || membership?.role === "Atendente",
    });
  });

  app.post<OrgParams>(base, canAdmin, async (request, reply) => {
    const { name } = nameSchema.parse(request.body);
    const pipeline = await pipelinesService.create(
      request.auth!.userId,
      request.params.organizationId,
      name,
    );
    return reply.code(201).send(pipeline);
  });

  app.patch<PipelineParams>(`${base}/:pipelineId`, canAdmin, async (request, reply) => {
    if (!uuid.safeParse(request.params.pipelineId).success) return reply.code(404).send();
    const { name } = nameSchema.parse(request.body);
    try {
      await pipelinesService.rename(request.params.organizationId, request.params.pipelineId, name);
      return { ok: true };
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });

  app.delete<PipelineParams>(`${base}/:pipelineId`, canAdmin, async (request, reply) => {
    if (!uuid.safeParse(request.params.pipelineId).success) return reply.code(404).send();
    try {
      await pipelinesService.remove(
        request.auth!.userId,
        request.params.organizationId,
        request.params.pipelineId,
      );
      return reply.code(204).send();
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });

  app.post<PipelineParams>(`${base}/:pipelineId/stages`, canAdmin, async (request, reply) => {
    if (!uuid.safeParse(request.params.pipelineId).success) return reply.code(404).send();
    const body = stageSchema.parse(request.body);
    try {
      const stage = await pipelinesService.addStage(
        request.params.organizationId,
        request.params.pipelineId,
        body.name,
        body.kind,
      );
      return reply.code(201).send(stage);
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });

  app.put<PipelineParams>(`${base}/:pipelineId/stage-order`, canAdmin, async (request, reply) => {
    if (!uuid.safeParse(request.params.pipelineId).success) return reply.code(404).send();
    const { stageIds } = orderSchema.parse(request.body);
    try {
      await pipelinesService.reorderStages(
        request.params.organizationId,
        request.params.pipelineId,
        stageIds,
      );
      return { ok: true };
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });

  const stageBase = "/organizations/:organizationId/pipeline-stages/:stageId";

  app.patch<StageParams>(stageBase, canAdmin, async (request, reply) => {
    if (!uuid.safeParse(request.params.stageId).success) return reply.code(404).send();
    const { name } = nameSchema.parse(request.body);
    try {
      await pipelinesService.renameStage(
        request.params.organizationId,
        request.params.stageId,
        name,
      );
      return { ok: true };
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });

  app.delete<StageParams>(stageBase, canAdmin, async (request, reply) => {
    if (!uuid.safeParse(request.params.stageId).success) return reply.code(404).send();
    try {
      await pipelinesService.removeStage(request.params.organizationId, request.params.stageId);
      return reply.code(204).send();
    } catch (err) {
      return handleDealsError(err, reply);
    }
  });
}
