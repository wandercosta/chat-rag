import { db } from "../../db/client.js";

export const supportSessionsRepository = {
  insert(masterUserId: string, organizationId: string, justification: string, expiresAt: Date) {
    return db
      .insertInto("support_access_sessions")
      .values({
        master_user_id: masterUserId,
        organization_id: organizationId,
        justification,
        expires_at: expiresAt.toISOString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  findActive(masterUserId: string, organizationId: string) {
    return db
      .selectFrom("support_access_sessions")
      .selectAll()
      .where("master_user_id", "=", masterUserId)
      .where("organization_id", "=", organizationId)
      .where("ended_at", "is", null)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();
  },

  end(id: string) {
    return db
      .updateTable("support_access_sessions")
      .set({ ended_at: new Date().toISOString() })
      .where("id", "=", id)
      .where("ended_at", "is", null)
      .returningAll()
      .executeTakeFirst();
  },

  listForOrganization(organizationId: string) {
    return db
      .selectFrom("support_access_sessions")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("started_at", "desc")
      .execute();
  },
};
