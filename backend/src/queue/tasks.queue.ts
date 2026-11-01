import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const TASKS_QUEUE = "tasks";

export const tasksQueue = new Queue(TASKS_QUEUE, {
  connection: { url: env.REDIS_URL },
});

/** Varredura de tarefas vencidas (ADR-008 #4) a cada minuto. */
export async function scheduleTaskReminders() {
  await tasksQueue.add(
    "lembretes",
    {},
    { repeat: { every: 60_000 }, removeOnComplete: 10, removeOnFail: 10 },
  );
}
