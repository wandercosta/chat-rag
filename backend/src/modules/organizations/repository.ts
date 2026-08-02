import { db } from "../../db/client.js";
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

  async findRetentionDays(id: string): Promise<number | null> {
    const row = await db
      .selectFrom("organizations")
      .select("retention_days")
      .where("id", "=", id)
      .executeTakeFirst();
    return row?.retention_days ?? null;
  },

  setRetentionDays(id: string, days: number | null) {
    return db
      .updateTable("organizations")
      .set({ retention_days: days })
      .where("id", "=", id)
      .execute();
  },
};
