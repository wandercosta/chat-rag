import { db } from "../../db/client.js";
import type { StageKind } from "../../db/types.js";
import { auditService } from "../audit/index.js";
import { dealsRepository } from "./deals.repository.js";
import { DealsConflictError, DealsNotFoundError } from "./errors.js";
import { pipelinesRepository } from "./pipelines.repository.js";

async function stagesOfPipeline(organizationId: string, pipelineId: string) {
  const stages = await pipelinesRepository.stagesOf(organizationId);
  return stages.filter((s) => s.pipeline_id === pipelineId);
}

/**
 * Funis e etapas da organizacao (ADR-008 #2): configuracao, nao codigo. Todo
 * funil mantem ao menos uma etapa de cada tipo (aberta, ganho, perdido).
 */
export const pipelinesService = {
  /**
   * O funil padrao so nasce para quem pode usar o funil: leitura do Master
   * em suporte ou do Analista nao cria nada no tenant (ADR-008 #5).
   */
  async list(organizationId: string, options: { createDefault: boolean }) {
    if (options.createDefault) await pipelinesRepository.ensureDefault(organizationId);
    const [pipelines, stages] = await Promise.all([
      pipelinesRepository.list(organizationId),
      pipelinesRepository.stagesOf(organizationId),
    ]);
    return pipelines.map((p) => ({
      ...p,
      stages: stages
        .filter((s) => s.pipeline_id === p.id)
        .map(({ pipeline_id: _pipeline, ...s }) => s),
    }));
  },

  async create(actorUserId: string, organizationId: string, name: string) {
    await pipelinesRepository.ensureDefault(organizationId);
    const position = await pipelinesRepository.nextPipelinePosition(organizationId);
    const pipeline = await db
      .transaction()
      .execute((trx) => pipelinesRepository.insertWithStages(trx, organizationId, name, position));
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou funil de vendas",
      type: "configuracao",
      target: pipeline.id,
    });
    return pipeline;
  },

  async rename(organizationId: string, pipelineId: string, name: string) {
    const result = await pipelinesRepository.renamePipeline(organizationId, pipelineId, name);
    if (Number(result.numUpdatedRows) === 0) throw new DealsNotFoundError();
  },

  async remove(actorUserId: string, organizationId: string, pipelineId: string) {
    if (!(await pipelinesRepository.findPipeline(organizationId, pipelineId))) {
      throw new DealsNotFoundError();
    }
    if ((await pipelinesRepository.list(organizationId)).length <= 1) {
      throw new DealsConflictError("a organizacao precisa de ao menos um funil");
    }
    await db.transaction().execute(async (trx) => {
      await pipelinesRepository.lockPipeline(trx, pipelineId);
      if ((await dealsRepository.countInPipeline(organizationId, pipelineId, trx)) > 0) {
        throw new DealsConflictError("mova ou exclua os negocios deste funil antes");
      }
      await pipelinesRepository.deletePipeline(organizationId, pipelineId, trx);
    });
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Excluiu funil de vendas",
      type: "configuracao",
      target: pipelineId,
    });
  },

  async addStage(organizationId: string, pipelineId: string, name: string, kind: StageKind) {
    if (!(await pipelinesRepository.findPipeline(organizationId, pipelineId))) {
      throw new DealsNotFoundError();
    }
    const stages = await stagesOfPipeline(organizationId, pipelineId);
    const position = stages.reduce((max, s) => Math.max(max, s.position + 1), 0);
    return pipelinesRepository.insertStage(organizationId, pipelineId, name, kind, position);
  },

  async renameStage(organizationId: string, stageId: string, name: string) {
    const result = await pipelinesRepository.renameStage(organizationId, stageId, name);
    if (Number(result.numUpdatedRows) === 0) throw new DealsNotFoundError();
  },

  /** Nova ordem das colunas: a lista tem que ter exatamente as etapas do funil. */
  async reorderStages(organizationId: string, pipelineId: string, stageIds: string[]) {
    const stages = await stagesOfPipeline(organizationId, pipelineId);
    if (stages.length === 0) throw new DealsNotFoundError();
    const current = new Set(stages.map((s) => s.id));
    if (stageIds.length !== current.size || !stageIds.every((id) => current.has(id))) {
      throw new DealsConflictError("informe todas as etapas do funil, cada uma uma vez");
    }
    await pipelinesRepository.reorderStages(organizationId, stageIds);
  },

  async removeStage(organizationId: string, stageId: string) {
    const stage = await pipelinesRepository.findStage(organizationId, stageId);
    if (!stage) throw new DealsNotFoundError();
    await db.transaction().execute(async (trx) => {
      await pipelinesRepository.lockPipeline(trx, stage.pipeline_id);
      if ((await dealsRepository.countInStage(organizationId, stageId, trx)) > 0) {
        throw new DealsConflictError("mova os negocios desta etapa antes de excluir");
      }
      const sameKind = await trx
        .selectFrom("pipeline_stages")
        .select("id")
        .where("organization_id", "=", organizationId)
        .where("pipeline_id", "=", stage.pipeline_id)
        .where("kind", "=", stage.kind)
        .execute();
      if (sameKind.length <= 1) {
        throw new DealsConflictError(`o funil precisa de ao menos uma etapa do tipo ${stage.kind}`);
      }
      await pipelinesRepository.deleteStage(organizationId, stageId, trx);
    });
  },
};
