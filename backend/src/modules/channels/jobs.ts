import type { ChannelJob } from "../../queue/channel-messages.queue.js";
import { deliverMessage } from "./delivery.service.js";
import { processInbound, processStatus } from "./inbound.service.js";

/** Um ponto de entrada para o worker (src/worker.ts) e para os testes. */
export function processChannelJob(job: ChannelJob) {
  switch (job.kind) {
    case "inbound":
      return processInbound(job.connectionId, job.message);
    case "status":
      return processStatus(job.connectionId, job.providerMessageId, job.status, job.error);
    case "outbound":
      return deliverMessage(job.organizationId, job.messageId);
  }
}
