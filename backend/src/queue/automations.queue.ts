import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const AUTOMATIONS_QUEUE = "automations";

export const automationsQueue = new Queue(AUTOMATIONS_QUEUE, {
  connection: { url: env.REDIS_URL },
});

/** Varredura do gatilho "sem resposta" (ADR-006 #4) a cada minuto. */
export async function scheduleNoReplyScan() {
  await automationsQueue.add(
    "scan-sem-resposta",
    {},
    { repeat: { every: 60_000 }, removeOnComplete: 10, removeOnFail: 10 },
  );
}
