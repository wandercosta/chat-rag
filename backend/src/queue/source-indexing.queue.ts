import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const SOURCE_INDEXING_QUEUE = "source-indexing";

export interface SourceIndexingJob {
  organizationId: string;
  sourceId: string;
}

export const sourceIndexingQueue = new Queue<SourceIndexingJob>(SOURCE_INDEXING_QUEUE, {
  connection: { url: env.REDIS_URL },
});

export function enqueueSourceIndexing(payload: SourceIndexingJob) {
  return sourceIndexingQueue.add("index", payload, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}
