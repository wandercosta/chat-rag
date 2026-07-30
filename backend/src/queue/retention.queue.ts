import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const RETENTION_QUEUE = "retention";
const REPEATABLE_JOB_ID = "daily-retention-sweep";

export const retentionQueue = new Queue(RETENTION_QUEUE, {
  connection: { url: env.REDIS_URL },
});

/** Agenda o job recorrente (ADR-002 #6). Idempotente: BullMQ nao duplica um
 * repeatable job com o mesmo jobId + padrao. Chamado uma vez na subida do worker. */
export function scheduleRetentionSweep() {
  return retentionQueue.add(
    "sweep",
    {},
    {
      jobId: REPEATABLE_JOB_ID,
      repeat: { pattern: "0 3 * * *" }, // todo dia as 03:00
      removeOnComplete: 30,
      removeOnFail: 30,
    },
  );
}
