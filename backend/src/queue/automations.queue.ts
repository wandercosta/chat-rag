import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const AUTOMATIONS_QUEUE = "automations";

export const automationsQueue = new Queue(AUTOMATIONS_QUEUE, {
  connection: { url: env.REDIS_URL },
});

/** Contato ganhou uma etiqueta: gatilho "etiqueta adicionada" no worker. */
export interface TagAddedJob {
  organizationId: string;
  contactId: string;
  tagId: string;
}

export const TAG_ADDED_JOB = "etiqueta-adicionada";

export function enqueueTagAdded(job: TagAddedJob) {
  return automationsQueue.add(TAG_ADDED_JOB, job, {
    attempts: 1,
    removeOnComplete: 500,
    removeOnFail: 500,
  });
}

/** Varredura do gatilho "sem resposta" (ADR-006 #4) a cada minuto. */
export async function scheduleNoReplyScan() {
  await automationsQueue.add(
    "scan-sem-resposta",
    {},
    { repeat: { every: 60_000 }, removeOnComplete: 10, removeOnFail: 10 },
  );
}
