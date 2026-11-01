import { sql } from "kysely";
import { db } from "../../db/client.js";
import type { DealStatus } from "../../db/types.js";

type Db = typeof db;

export interface DealFilter {
  pipelineId?: string;
  stageId?: string;
  contactId?: string;
  ownerUserId?: string;
  status?: DealStatus;
}

export interface DealValues {
  title?: string;
  value_cents?: number | null;
  contact_id?: string | null;
  owner_user_id?: string | null;
  expected_close_date?: string | null;
}

function selectDeals(trx: Db = db) {
  return trx
    .selectFrom("deals")
    .select([
      "id",
      "pipeline_id",
      "stage_id",
      "position",
      "title",
      "value_cents",
      "contact_id",
      "owner_user_id",
      sql<string | null>`to_char(expected_close_date, 'YYYY-MM-DD')`.as("expected_close_date"),
      "status",
      "lost_reason",
      "closed_at",
      "created_at",
      "updated_at",
    ]);
}

export type DealRow = Awaited<ReturnType<typeof dealsRepository.findById>> & object;

export const dealsRepository = {
  list(organizationId: string, filter: DealFilter) {
    let query = selectDeals().where("organization_id", "=", organizationId);
    if (filter.pipelineId) query = query.where("pipeline_id", "=", filter.pipelineId);
    if (filter.stageId) query = query.where("stage_id", "=", filter.stageId);
    if (filter.contactId) query = query.where("contact_id", "=", filter.contactId);
    if (filter.ownerUserId) query = query.where("owner_user_id", "=", filter.ownerUserId);
    if (filter.status) query = query.where("status", "=", filter.status);
    return query.orderBy("position").orderBy("created_at").limit(2000).execute();
  },

  findById(organizationId: string, id: string, trx: Db = db) {
    return selectDeals(trx)
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  titlesByIds(organizationId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return db
      .selectFrom("deals")
      .select(["id", "title"])
      .where("organization_id", "=", organizationId)
      .where("id", "in", ids)
      .execute();
  },

  countInStage(organizationId: string, stageId: string) {
    return db
      .selectFrom("deals")
      .select(sql<string>`count(*)`.as("count"))
      .where("organization_id", "=", organizationId)
      .where("stage_id", "=", stageId)
      .executeTakeFirst()
      .then((r) => Number(r?.count ?? 0));
  },

  countInPipeline(organizationId: string, pipelineId: string) {
    return db
      .selectFrom("deals")
      .select(sql<string>`count(*)`.as("count"))
      .where("organization_id", "=", organizationId)
      .where("pipeline_id", "=", pipelineId)
      .executeTakeFirst()
      .then((r) => Number(r?.count ?? 0));
  },

  insert(
    trx: Db,
    organizationId: string,
    values: DealValues & {
      title: string;
      pipeline_id: string;
      stage_id: string;
      status: DealStatus;
      created_by: string;
    },
  ) {
    return trx
      .insertInto("deals")
      .values({
        organization_id: organizationId,
        ...values,
        position: sql<number>`(select coalesce(max(position) + 1, 0) from deals where stage_id = ${values.stage_id})`,
        closed_at: values.status === "aberto" ? null : new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
  },

  update(organizationId: string, id: string, values: DealValues) {
    return db
      .updateTable("deals")
      .set({ ...values, updated_at: new Date() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  /** Ids da etapa na ordem do kanban (sem o negocio que esta sendo movido). */
  async idsInStage(trx: Db, organizationId: string, stageId: string, exceptId: string) {
    const rows = await trx
      .selectFrom("deals")
      .select("id")
      .where("organization_id", "=", organizationId)
      .where("stage_id", "=", stageId)
      .where("id", "<>", exceptId)
      .orderBy("position")
      .orderBy("created_at")
      .execute();
    return rows.map((r) => r.id);
  },

  async placeInStage(
    trx: Db,
    organizationId: string,
    dealId: string,
    stage: { id: string; status: DealStatus },
    orderedIds: string[],
    lostReason: string | null,
    statusChanged: boolean,
  ) {
    await trx
      .updateTable("deals")
      .set({
        stage_id: stage.id,
        status: stage.status,
        lost_reason: stage.status === "perdido" ? lostReason : null,
        ...(statusChanged && { closed_at: stage.status === "aberto" ? null : new Date() }),
        updated_at: new Date(),
      })
      .where("organization_id", "=", organizationId)
      .where("id", "=", dealId)
      .execute();
    for (const [position, id] of orderedIds.entries()) {
      await trx
        .updateTable("deals")
        .set({ position })
        .where("organization_id", "=", organizationId)
        .where("id", "=", id)
        .execute();
    }
  },

  insertStageChange(
    trx: Db,
    organizationId: string,
    dealId: string,
    fromStageId: string | null,
    toStageId: string,
    userId: string,
  ) {
    return trx
      .insertInto("deal_stage_changes")
      .values({
        organization_id: organizationId,
        deal_id: dealId,
        from_stage_id: fromStageId,
        to_stage_id: toStageId,
        changed_by: userId,
      })
      .execute();
  },

  history(organizationId: string, dealId: string) {
    return db
      .selectFrom("deal_stage_changes")
      .select(["from_stage_id", "to_stage_id", "changed_by", "changed_at"])
      .where("organization_id", "=", organizationId)
      .where("deal_id", "=", dealId)
      .orderBy("changed_at", "desc")
      .limit(100)
      .execute();
  },

  delete(organizationId: string, id: string) {
    return db
      .deleteFrom("deals")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  exportAll(organizationId: string) {
    return selectDeals().where("organization_id", "=", organizationId).execute();
  },
};
