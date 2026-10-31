import { db } from "../../db/client.js";
import type { AiLimitMode, RetentionMode } from "../../db/types.js";
import type { TenantRole } from "../../db/types.js";

export const organizationsRepository = {
  insertOrganization(trxDb: typeof db, name: string, slug: string) {
    return trxDb
      .insertInto("organizations")
      .values({ name, slug, status: "ativo" })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  insertMembership(trxDb: typeof db, userId: string, organizationId: string, role: TenantRole) {
    return trxDb
      .insertInto("memberships")
      .values({ user_id: userId, organization_id: organizationId, role })
      .execute();
  },

  list() {
    return db.selectFrom("organizations").selectAll().orderBy("created_at", "desc").execute();
  },

  findById(id: string) {
    return db.selectFrom("organizations").selectAll().where("id", "=", id).executeTakeFirst();
  },

  setStatus(id: string, status: "ativo" | "suspenso") {
    return db.updateTable("organizations").set({ status }).where("id", "=", id).execute();
  },

  async findRetentionPolicy(id: string) {
    const row = await db
      .selectFrom("organizations")
      .select(["retention_days", "retention_mode"])
      .where("id", "=", id)
      .executeTakeFirst();
    return { days: row?.retention_days ?? null, mode: row?.retention_mode ?? "excluir" };
  },

  findAiLimit(id: string) {
    return db
      .selectFrom("organizations")
      .select(["ai_limit_mode", "ai_monthly_tokens"])
      .where("id", "=", id)
      .executeTakeFirst();
  },

  setAiLimit(id: string, mode: AiLimitMode, tokens: number | null) {
    return db
      .updateTable("organizations")
      .set({ ai_limit_mode: mode, ai_monthly_tokens: tokens })
      .where("id", "=", id)
      .executeTakeFirst();
  },

  /** true so na primeira chamada do mes: o update marca e serve de trava. */
  async claimLimitNotice(id: string, month: string) {
    const row = await db
      .updateTable("organizations")
      .set({ ai_limit_notified_month: month })
      .where("id", "=", id)
      .where((eb) =>
        eb.or([
          eb("ai_limit_notified_month", "is", null),
          eb("ai_limit_notified_month", "<>", month),
        ]),
      )
      .returning("id")
      .executeTakeFirst();
    return !!row;
  },

  setRetentionPolicy(id: string, days: number | null, mode?: RetentionMode) {
    return db
      .updateTable("organizations")
      .set({ retention_days: days, ...(mode && { retention_mode: mode }) })
      .where("id", "=", id)
      .execute();
  },
};
