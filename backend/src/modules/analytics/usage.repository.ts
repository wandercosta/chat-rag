import { sql } from "kysely";
import { db } from "../../db/client.js";
import type { UsageEventType } from "../../db/types.js";

export interface UsageEventInput {
  organizationId: string;
  assistantId?: string | null;
  type: UsageEventType;
  payload?: Record<string, unknown>;
}

export const usageRepository = {
  insert(input: UsageEventInput) {
    return db
      .insertInto("usage_events")
      .values({
        organization_id: input.organizationId,
        assistant_id: input.assistantId ?? null,
        type: input.type,
        payload: JSON.stringify(input.payload ?? {}),
      })
      .execute();
  },

  countByType(organizationId: string, since: Date) {
    return db
      .selectFrom("usage_events")
      .select(["type", sql<string>`count(*)`.as("count")])
      .where("organization_id", "=", organizationId)
      .where("created_at", ">=", since)
      .groupBy("type")
      .execute();
  },

  /** Toda a plataforma (visao do Master): contagem por organizacao e tipo. */
  countByOrganizationAndType(since: Date) {
    return db
      .selectFrom("usage_events")
      .select(["organization_id", "type", sql<string>`count(*)`.as("count")])
      .where("created_at", ">=", since)
      .groupBy(["organization_id", "type"])
      .execute();
  },

  platformAverageRagLatencyMs(since: Date) {
    return sql<{ avg_latency_ms: string | null }>`
      select avg((payload->>'latencyMs')::numeric) as avg_latency_ms
      from usage_events
      where type = 'rag_query'
        and created_at >= ${since}
    `
      .execute(db)
      .then((r) => r.rows[0]?.avg_latency_ms ?? null);
  },

  averageRagLatencyMs(organizationId: string, since: Date) {
    return sql<{ avg_latency_ms: string | null }>`
      select avg((payload->>'latencyMs')::numeric) as avg_latency_ms
      from usage_events
      where organization_id = ${organizationId}
        and type = 'rag_query'
        and created_at >= ${since}
    `
      .execute(db)
      .then((r) => r.rows[0]?.avg_latency_ms ?? null);
  },
};
