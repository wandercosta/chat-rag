import { sql } from "kysely";
import { db } from "../../db/client.js";
import type { StageKind } from "../../db/types.js";

type Db = typeof db;

export const DEFAULT_STAGES: { name: string; kind: StageKind }[] = [
  { name: "Novo", kind: "aberta" },
  { name: "Qualificado", kind: "aberta" },
  { name: "Proposta", kind: "aberta" },
  { name: "Negociação", kind: "aberta" },
  { name: "Ganho", kind: "ganho" },
  { name: "Perdido", kind: "perdido" },
];

export const pipelinesRepository = {
  list(organizationId: string) {
    return db
      .selectFrom("pipelines")
      .select(["id", "name", "position"])
      .where("organization_id", "=", organizationId)
      .orderBy("position")
      .orderBy("created_at")
      .execute();
  },

  stagesOf(organizationId: string) {
    return db
      .selectFrom("pipeline_stages")
      .select(["id", "pipeline_id", "name", "kind", "position"])
      .where("organization_id", "=", organizationId)
      .orderBy("position")
      .execute();
  },

  findPipeline(organizationId: string, id: string) {
    return db
      .selectFrom("pipelines")
      .select(["id", "name"])
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  findStage(organizationId: string, id: string) {
    return db
      .selectFrom("pipeline_stages")
      .select(["id", "pipeline_id", "name", "kind", "position"])
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  /** Primeiro funil da organizacao, criado uma vez mesmo com leituras simultaneas. */
  ensureDefault(organizationId: string) {
    return db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext(${`pipelines:${organizationId}`}))`.execute(
        trx,
      );
      const existing = await trx
        .selectFrom("pipelines")
        .select("id")
        .where("organization_id", "=", organizationId)
        .executeTakeFirst();
      if (!existing) await this.insertWithStages(trx, organizationId, "Vendas", 0);
    });
  },

  async insertWithStages(trx: Db, organizationId: string, name: string, position: number) {
    const pipeline = await trx
      .insertInto("pipelines")
      .values({ organization_id: organizationId, name, position })
      .returning(["id", "name", "position"])
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("pipeline_stages")
      .values(
        DEFAULT_STAGES.map((s, i) => ({
          organization_id: organizationId,
          pipeline_id: pipeline.id,
          name: s.name,
          kind: s.kind,
          position: i,
        })),
      )
      .execute();
    return pipeline;
  },

  async nextPipelinePosition(organizationId: string) {
    const row = await db
      .selectFrom("pipelines")
      .select(sql<number>`coalesce(max(position) + 1, 0)`.as("next"))
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();
    return Number(row?.next ?? 0);
  },

  renamePipeline(organizationId: string, id: string, name: string) {
    return db
      .updateTable("pipelines")
      .set({ name })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  deletePipeline(organizationId: string, id: string) {
    return db
      .deleteFrom("pipelines")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  insertStage(
    organizationId: string,
    pipelineId: string,
    name: string,
    kind: StageKind,
    position: number,
  ) {
    return db
      .insertInto("pipeline_stages")
      .values({ organization_id: organizationId, pipeline_id: pipelineId, name, kind, position })
      .returning(["id", "pipeline_id", "name", "kind", "position"])
      .executeTakeFirstOrThrow();
  },

  renameStage(organizationId: string, id: string, name: string) {
    return db
      .updateTable("pipeline_stages")
      .set({ name })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  /** Reordena as etapas do funil na ordem dada (ids ja conferidos). */
  reorderStages(organizationId: string, ids: string[]) {
    return db.transaction().execute(async (trx) => {
      for (const [position, id] of ids.entries()) {
        await trx
          .updateTable("pipeline_stages")
          .set({ position })
          .where("organization_id", "=", organizationId)
          .where("id", "=", id)
          .execute();
      }
    });
  },

  deleteStage(organizationId: string, id: string) {
    return db
      .deleteFrom("pipeline_stages")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },
};
