import { db } from "../../db/client.js";
import type { DealStatus, StageKind } from "../../db/types.js";
import { auditService } from "../audit/index.js";
import { contactsService } from "../contacts/index.js";
import { membersService } from "../identity/index.js";
import { webhooksService } from "../webhooks/index.js";
import { dealsRepository, type DealFilter, type DealRow } from "./deals.repository.js";
import { DealsInvalidReferenceError, DealsNotFoundError } from "./errors.js";
import { pipelinesRepository } from "./pipelines.repository.js";

export interface DealInput {
  title?: string;
  valueCents?: number | null;
  contactId?: string | null;
  ownerUserId?: string | null;
  expectedCloseDate?: string | null;
}

const statusOf = (kind: StageKind): DealStatus =>
  kind === "aberta" ? "aberto" : kind === "ganho" ? "ganho" : "perdido";

/** Responsavel tem que ser de quem atende: Administrador ou Atendente da organizacao. */
async function assertRefs(organizationId: string, input: DealInput) {
  if (input.contactId) {
    const labels = await contactsService.labelsFor(organizationId, [input.contactId]);
    if (!labels.has(input.contactId)) throw new DealsInvalidReferenceError("contato");
  }
  if (input.ownerUserId) {
    const role = await membersService.roleOf(organizationId, input.ownerUserId);
    if (role !== "Administrador" && role !== "Atendente") {
      throw new DealsInvalidReferenceError("responsavel");
    }
  }
}

function toValues(input: DealInput) {
  return {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.valueCents !== undefined && { value_cents: input.valueCents }),
    ...(input.contactId !== undefined && { contact_id: input.contactId }),
    ...(input.ownerUserId !== undefined && { owner_user_id: input.ownerUserId }),
    ...(input.expectedCloseDate !== undefined && {
      expected_close_date: input.expectedCloseDate,
    }),
  };
}

/** Nome do contato e e-mail do responsavel pelas interfaces publicas (ADR-002). */
async function present(organizationId: string, rows: DealRow[]) {
  const [labels, members] = await Promise.all([
    contactsService.labelsFor(
      organizationId,
      rows.flatMap((r) => (r.contact_id ? [r.contact_id] : [])),
    ),
    membersService.list(organizationId),
  ]);
  const emails = new Map(members.map((m) => [m.user_id, m.email]));
  return rows.map((r) => ({
    id: r.id,
    pipelineId: r.pipeline_id,
    stageId: r.stage_id,
    position: r.position,
    title: r.title,
    valueCents: r.value_cents === null ? null : Number(r.value_cents),
    contactId: r.contact_id,
    contactLabel: r.contact_id ? (labels.get(r.contact_id) ?? null) : null,
    ownerUserId: r.owner_user_id,
    ownerEmail: r.owner_user_id ? (emails.get(r.owner_user_id) ?? null) : null,
    expectedCloseDate: r.expected_close_date,
    status: r.status,
    lostReason: r.lost_reason,
    closedAt: r.closed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

const auditAction: Record<DealStatus, string> = {
  aberto: "Moveu negocio de etapa",
  ganho: "Marcou negocio como ganho",
  perdido: "Marcou negocio como perdido",
};

/** Negocios do funil de vendas (ADR-008). */
export const dealsService = {
  async list(organizationId: string, filter: DealFilter) {
    return present(organizationId, await dealsRepository.list(organizationId, filter));
  },

  async get(organizationId: string, dealId: string) {
    const row = await dealsRepository.findById(organizationId, dealId);
    if (!row) throw new DealsNotFoundError();
    const [[deal], history, members] = await Promise.all([
      present(organizationId, [row]),
      dealsRepository.history(organizationId, dealId),
      membersService.list(organizationId),
    ]);
    const emails = new Map(members.map((m) => [m.user_id, m.email]));
    return {
      ...deal,
      history: history.map((h) => ({
        fromStageId: h.from_stage_id,
        toStageId: h.to_stage_id,
        changedByEmail: h.changed_by ? (emails.get(h.changed_by) ?? null) : null,
        changedAt: h.changed_at,
      })),
    };
  },

  async create(
    actorUserId: string,
    organizationId: string,
    input: DealInput & { title: string; pipelineId: string; stageId?: string },
  ) {
    const pipeline = await pipelinesRepository.findPipeline(organizationId, input.pipelineId);
    if (!pipeline) throw new DealsInvalidReferenceError("funil");
    const stages = (await pipelinesRepository.stagesOf(organizationId)).filter(
      (s) => s.pipeline_id === pipeline.id,
    );
    const stage = input.stageId
      ? stages.find((s) => s.id === input.stageId)
      : stages.find((s) => s.kind === "aberta");
    if (!stage) throw new DealsInvalidReferenceError("etapa");
    await assertRefs(organizationId, input);

    const status = statusOf(stage.kind);
    const { id } = await db.transaction().execute(async (trx) => {
      const deal = await dealsRepository.insert(trx, organizationId, {
        ...toValues(input),
        title: input.title,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        status,
        created_by: actorUserId,
      });
      await dealsRepository.insertStageChange(
        trx,
        organizationId,
        deal.id,
        null,
        stage.id,
        actorUserId,
      );
      return deal;
    });
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou negocio",
      type: "conteudo",
      target: id,
    });
    await webhooksService.emit(organizationId, "negocio.criado", {
      dealId: id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      status,
      contactId: input.contactId ?? null,
    });
    return this.get(organizationId, id);
  },

  async update(actorUserId: string, organizationId: string, dealId: string, input: DealInput) {
    if (!(await dealsRepository.findById(organizationId, dealId))) throw new DealsNotFoundError();
    await assertRefs(organizationId, input);
    await dealsRepository.update(organizationId, dealId, toValues(input));
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Editou negocio",
      type: "conteudo",
      target: dealId,
    });
    return this.get(organizationId, dealId);
  },

  /** Kanban: muda de etapa (do mesmo funil) e/ou de posicao dentro dela. */
  async move(
    actorUserId: string,
    organizationId: string,
    dealId: string,
    input: { stageId: string; position?: number; lostReason?: string | null },
  ) {
    const deal = await dealsRepository.findById(organizationId, dealId);
    if (!deal) throw new DealsNotFoundError();
    const stage = await pipelinesRepository.findStage(organizationId, input.stageId);
    if (!stage || stage.pipeline_id !== deal.pipeline_id) {
      throw new DealsInvalidReferenceError("etapa");
    }
    const status = statusOf(stage.kind);
    const stageChanged = stage.id !== deal.stage_id;

    await db.transaction().execute(async (trx) => {
      const ids = await dealsRepository.idsInStage(trx, organizationId, stage.id, dealId);
      const at = Math.min(Math.max(input.position ?? ids.length, 0), ids.length);
      ids.splice(at, 0, dealId);
      await dealsRepository.placeInStage(
        trx,
        organizationId,
        dealId,
        { id: stage.id, status },
        ids,
        input.lostReason ?? (stageChanged ? null : deal.lost_reason),
        status !== deal.status,
      );
      if (stageChanged) {
        await dealsRepository.insertStageChange(
          trx,
          organizationId,
          dealId,
          deal.stage_id,
          stage.id,
          actorUserId,
        );
      }
    });

    if (stageChanged) {
      await auditService.record({
        actorUserId,
        organizationId,
        action: auditAction[status],
        type: "conteudo",
        target: dealId,
      });
      await webhooksService.emit(organizationId, "negocio.etapa_alterada", {
        dealId,
        fromStageId: deal.stage_id,
        toStageId: stage.id,
        status,
      });
    }
    return this.get(organizationId, dealId);
  },

  async remove(actorUserId: string, organizationId: string, dealId: string) {
    const result = await dealsRepository.delete(organizationId, dealId);
    if (Number(result.numDeletedRows) === 0) throw new DealsNotFoundError();
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Excluiu negocio",
      type: "conteudo",
      target: dealId,
    });
  },

  async exportAll(organizationId: string) {
    return present(organizationId, await dealsRepository.exportAll(organizationId));
  },
};
