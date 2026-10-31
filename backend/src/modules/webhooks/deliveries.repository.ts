import { db } from "../../db/client.js";
import type { WebhookDeliveryStatus } from "../../db/types.js";

export const deliveriesRepository = {
  insert(organizationId: string, endpointId: string, event: string, payload: object) {
    return db
      .insertInto("webhook_deliveries")
      .values({
        organization_id: organizationId,
        endpoint_id: endpointId,
        event,
        payload: JSON.stringify(payload),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
  },

  find(id: string) {
    return db.selectFrom("webhook_deliveries").selectAll().where("id", "=", id).executeTakeFirst();
  },

  record(
    id: string,
    result: {
      status: WebhookDeliveryStatus;
      attempts: number;
      statusCode: number | null;
      error: string | null;
    },
  ) {
    return db
      .updateTable("webhook_deliveries")
      .set({
        status: result.status,
        attempts: result.attempts,
        last_status_code: result.statusCode,
        last_error: result.error,
        ...(result.status === "entregue" && { delivered_at: new Date() }),
      })
      .where("id", "=", id)
      .execute();
  },

  listForEndpoint(organizationId: string, endpointId: string, limit = 50) {
    return db
      .selectFrom("webhook_deliveries")
      .select([
        "id",
        "event",
        "status",
        "attempts",
        "last_status_code",
        "last_error",
        "created_at",
        "delivered_at",
      ])
      .where("organization_id", "=", organizationId)
      .where("endpoint_id", "=", endpointId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();
  },
};
