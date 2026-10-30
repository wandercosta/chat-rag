import { DelayedError, Worker } from "bullmq";
import { env } from "./config/env.js";
import { redis } from "./db/redis.js";
import { extractionService, sourcesService } from "./modules/knowledge/index.js";
import { indexingService } from "./modules/rag/index.js";
import { retentionService } from "./modules/conversations/index.js";
import { usageService } from "./modules/analytics/index.js";
import { SOURCE_INDEXING_QUEUE, type SourceIndexingJob } from "./queue/source-indexing.queue.js";
import { RETENTION_QUEUE, scheduleRetentionSweep } from "./queue/retention.queue.js";
import { CHANNEL_MESSAGES_QUEUE, type ChannelJob } from "./queue/channel-messages.queue.js";
import { processChannelJob } from "./modules/channels/index.js";
import { CAMPAIGNS_QUEUE, type CampaignTickJob } from "./queue/campaigns.queue.js";
import { runCampaignTick } from "./modules/campaigns/index.js";
import { AUTOMATIONS_QUEUE, scheduleNoReplyScan } from "./queue/automations.queue.js";
import { scanAllNoReply } from "./modules/automations/index.js";
import { WEBHOOKS_QUEUE, type WebhookDeliveryJob } from "./queue/webhooks.queue.js";
import { processWebhookDelivery } from "./modules/webhooks/index.js";

// Limite de jobs simultaneos por tenant (ADR-002 #4): evita que um upload em
// massa de uma organizacao monopolize a fila de indexacao das demais.
const MAX_CONCURRENT_PER_TENANT = 2;
const RETRY_DELAY_MS = 5000;

function inflightKey(organizationId: string) {
  return `indexing:inflight:${organizationId}`;
}

async function tryAcquireTenantSlot(organizationId: string): Promise<boolean> {
  const current = await redis.incr(inflightKey(organizationId));
  if (current > MAX_CONCURRENT_PER_TENANT) {
    await redis.decr(inflightKey(organizationId));
    return false;
  }
  return true;
}

async function releaseTenantSlot(organizationId: string): Promise<void> {
  await redis.decr(inflightKey(organizationId));
}

const worker = new Worker<SourceIndexingJob>(
  SOURCE_INDEXING_QUEUE,
  async (job, token) => {
    const { organizationId, sourceId } = job.data;

    if (!(await tryAcquireTenantSlot(organizationId))) {
      await job.moveToDelayed(Date.now() + RETRY_DELAY_MS, token);
      throw new DelayedError();
    }

    try {
      await sourcesService.markProcessing(organizationId, sourceId);
      const { topicId, chunks } = await extractionService.extractAndChunk(organizationId, sourceId);
      const chunkCount = await indexingService.embedAndStoreChunks(
        organizationId,
        sourceId,
        topicId,
        chunks,
      );
      await sourcesService.markReady(organizationId, sourceId, chunkCount);
      await usageService.record({
        organizationId,
        type: "indexing_completed",
        payload: { sourceId, chunkCount },
      });
    } catch (err) {
      if (err instanceof DelayedError) throw err;
      const message = err instanceof Error ? err.message : "erro desconhecido na indexacao";
      await sourcesService.markError(organizationId, sourceId, message);
      await usageService.record({
        organizationId,
        type: "indexing_failed",
        payload: { sourceId, message },
      });
    } finally {
      await releaseTenantSlot(organizationId);
    }
  },
  { connection: { url: env.REDIS_URL }, concurrency: 5 },
);

worker.on("failed", (job, err) => {
  console.error(`job de indexacao falhou (source ${job?.data.sourceId}):`, err.message);
});

const retentionWorker = new Worker(
  RETENTION_QUEUE,
  async () => {
    const summary = await retentionService.purgeExpired();
    console.log("retencao executada:", summary);
  },
  { connection: { url: env.REDIS_URL }, concurrency: 1 },
);

retentionWorker.on("failed", (job, err) => {
  console.error("job de retencao falhou:", err.message);
});

// Canais (ADR-006): mensagens recebidas, recibos e envios pela fila, para o
// webhook responder rapido e o envio ter novas tentativas.
const channelWorker = new Worker<ChannelJob>(
  CHANNEL_MESSAGES_QUEUE,
  async (job) => processChannelJob(job.data),
  { connection: { url: env.REDIS_URL }, concurrency: 5 },
);

channelWorker.on("failed", (job, err) => {
  console.error(`job de canal falhou (${job?.data.kind}):`, err.message);
});

// Campanhas (ADR-006 #9): um lote por minuto por campanha, com teto por
// organizacao (modules/campaigns/sender.ts).
const campaignWorker = new Worker<CampaignTickJob>(
  CAMPAIGNS_QUEUE,
  async (job) => runCampaignTick(job.data.organizationId, job.data.campaignId),
  { connection: { url: env.REDIS_URL }, concurrency: 2 },
);

campaignWorker.on("failed", (job, err) => {
  console.error(`lote de campanha falhou (${job?.data.campaignId}):`, err.message);
});

// Automacoes (ADR-006 #4): varredura do gatilho "sem resposta" a cada minuto.
const automationWorker = new Worker(AUTOMATIONS_QUEUE, async () => scanAllNoReply(), {
  connection: { url: env.REDIS_URL },
  concurrency: 1,
});

automationWorker.on("failed", (_job, err) => {
  console.error("varredura de automacoes falhou:", err.message);
});

// Webhooks de saida (etapa 8): uma tentativa por job; a fila refaz com espera
// crescente (queue/webhooks.queue.ts).
const webhookWorker = new Worker<WebhookDeliveryJob>(
  WEBHOOKS_QUEUE,
  async (job) => processWebhookDelivery(job.data.deliveryId, job.attemptsMade + 1),
  { connection: { url: env.REDIS_URL }, concurrency: 10 },
);

webhookWorker.on("failed", (job, err) => {
  console.error(`entrega de webhook falhou (${job?.data.deliveryId}):`, err.message);
});

await scheduleRetentionSweep();
await scheduleNoReplyScan();

console.log("worker de indexacao, retencao, canais, campanhas, automacoes e webhooks iniciado");
