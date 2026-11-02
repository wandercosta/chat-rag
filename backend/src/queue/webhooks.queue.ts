import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const WEBHOOKS_QUEUE = "webhooks";

/** Tentativas por entrega: 1 imediata + 5 com espera crescente (~30 min no total). */
export const WEBHOOK_MAX_ATTEMPTS = 6;

export interface WebhookDeliveryJob {
  deliveryId: string;
}

export const webhooksQueue = new Queue<WebhookDeliveryJob>(WEBHOOKS_QUEUE, {
  connection: { url: env.REDIS_URL },
});

export function enqueueWebhookDelivery(deliveryId: string) {
  return webhooksQueue.add(
    "deliver",
    { deliveryId },
    {
      jobId: deliveryId,
      attempts: WEBHOOK_MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: 500,
      removeOnFail: 500,
    },
  );
}
