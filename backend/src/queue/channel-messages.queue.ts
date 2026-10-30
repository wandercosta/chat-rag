import { Queue } from "bullmq";
import { env } from "../config/env.js";
import type { DeliveryStatus } from "../db/types.js";

export const CHANNEL_MESSAGES_QUEUE = "channel-messages";

/** Mensagem recebida de um canal, ja normalizada (ver channels/*.webhook.ts). */
export interface InboundMessage {
  providerMessageId: string;
  /** Endereco do remetente no canal (wa_id no WhatsApp). */
  from: string;
  name: string | null;
  text: string;
}

/**
 * O webhook so valida e enfileira; o trabalho pesado (contato, conversa,
 * resposta da IA, envio) roda no worker. Assim a Meta recebe o 200 rapido e
 * nao reenvia o mesmo evento por timeout.
 */
export type ChannelJob =
  | { kind: "inbound"; connectionId: string; message: InboundMessage }
  | {
      kind: "status";
      connectionId: string;
      providerMessageId: string;
      status: DeliveryStatus;
      error: string | null;
    }
  | { kind: "outbound"; organizationId: string; messageId: string };

export const channelMessagesQueue = new Queue<ChannelJob>(CHANNEL_MESSAGES_QUEUE, {
  connection: { url: env.REDIS_URL },
});

export function enqueueChannelJob(job: ChannelJob) {
  // Entrada: um id por mensagem do provedor, entao o mesmo evento reenviado
  // pela Meta nao vira dois jobs; e sem nova tentativa, porque a mensagem ja
  // foi gravada e repetir mandaria a resposta duas vezes. Envio: 3 tentativas.
  const jobId =
    job.kind === "inbound"
      ? `in-${job.message.providerMessageId}`
      : job.kind === "outbound"
        ? `out-${job.messageId}`
        : undefined;
  return channelMessagesQueue.add(job.kind, job, {
    jobId,
    attempts: job.kind === "outbound" ? 3 : 1,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 500,
    removeOnFail: 500,
  });
}
