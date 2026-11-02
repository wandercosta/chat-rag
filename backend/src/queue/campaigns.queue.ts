import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const CAMPAIGNS_QUEUE = "campaigns";

export interface CampaignTickJob {
  organizationId: string;
  campaignId: string;
}

export const campaignsQueue = new Queue<CampaignTickJob>(CAMPAIGNS_QUEUE, {
  connection: { url: env.REDIS_URL },
});

/**
 * Cada "tick" envia um lote (o ritmo da campanha por minuto) e agenda o
 * proximo para dali a um minuto, ate acabar. `delayMs` agenda o primeiro para
 * a data escolhida.
 */
export function enqueueCampaignTick(job: CampaignTickJob, delayMs = 0) {
  return campaignsQueue.add("tick", job, {
    delay: Math.max(0, delayMs),
    removeOnComplete: 200,
    removeOnFail: 200,
  });
}
