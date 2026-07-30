import { db } from "../../db/client.js";
import type { SourceKind, SourceStatus } from "../../db/types.js";

export interface NewSourceInput {
  organizationId: string;
  topicId: string;
  title: string;
  kind: SourceKind;
  status: SourceStatus;
  originUrl?: string | null;
  rawText?: string | null;
  storageKey?: string | null;
}

export const sourcesRepository = {
  listForTopic(organizationId: string, topicId: string) {
    return db
      .selectFrom("sources")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("topic_id", "=", topicId)
      .orderBy("updated_at", "desc")
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("sources")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  listByStatus(organizationId: string, status: SourceStatus) {
    return db
      .selectFrom("sources")
      .select(["id", "title"])
      .where("organization_id", "=", organizationId)
      .where("status", "=", status)
      .execute();
  },

  insert(input: NewSourceInput) {
    return db
      .insertInto("sources")
      .values({
        organization_id: input.organizationId,
        topic_id: input.topicId,
        title: input.title,
        kind: input.kind,
        status: input.status,
        origin_url: input.originUrl ?? null,
        raw_text: input.rawText ?? null,
        storage_key: input.storageKey ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  setStatus(organizationId: string, id: string, status: SourceStatus, errorMessage?: string | null) {
    return db
      .updateTable("sources")
      .set({ status, error_message: errorMessage ?? null, updated_at: new Date().toISOString() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  },

  setChunkCount(organizationId: string, id: string, chunkCount: number) {
    return db
      .updateTable("sources")
      .set({ chunk_count: chunkCount, updated_at: new Date().toISOString() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .execute();
  },
};
