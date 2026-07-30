import { db } from "../../db/client.js";
import type { AuditType } from "../../db/types.js";

export interface AuditEventInput {
  actorUserId: string | null;
  organizationId: string | null;
  action: string;
  type: AuditType;
  target: string;
}

export const auditRepository = {
  insert(trxDb: typeof db, input: AuditEventInput) {
    return trxDb
      .insertInto("audit_events")
      .values({
        actor_user_id: input.actorUserId,
        organization_id: input.organizationId,
        action: input.action,
        type: input.type,
        target: input.target,
      })
      .execute();
  },

  listForOrganization(organizationId: string) {
    return db
      .selectFrom("audit_events")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "desc")
      .limit(100)
      .execute();
  },
};
