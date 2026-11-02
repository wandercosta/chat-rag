import crypto from "node:crypto";
import { auditService } from "../audit/index.js";
import { encryptSecret, serializeEnvelope } from "../../crypto/envelope.js";
import { enqueueWebhookDelivery } from "../../queue/webhooks.queue.js";
import { deliveriesRepository } from "./deliveries.repository.js";
import { endpointsRepository } from "./endpoints.repository.js";
import type { WebhookEvent } from "./events.js";
import { assertWebhookUrl } from "./url-guard.js";

export class WebhookNotFoundError extends Error {}

const MAX_ENDPOINTS = 10;
export class TooManyWebhooksError extends Error {}

/** Segredo de assinatura: aparece uma vez (ao criar ou trocar). */
function newSecret() {
  const plaintext = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  return { plaintext, sealed: serializeEnvelope(encryptSecret(plaintext)) };
}

export interface WebhookInput {
  url: string;
  events: WebhookEvent[];
}

export const webhooksService = {
  list(organizationId: string) {
    return endpointsRepository.list(organizationId);
  },

  async create(actorUserId: string, organizationId: string, input: WebhookInput) {
    assertWebhookUrl(input.url);
    if ((await endpointsRepository.list(organizationId)).length >= MAX_ENDPOINTS) {
      throw new TooManyWebhooksError();
    }
    const secret = newSecret();
    const endpoint = await endpointsRepository.insert(organizationId, {
      url: input.url,
      events: input.events,
      secret: secret.sealed,
      createdBy: actorUserId,
    });
    await auditService.record({
      actorUserId,
      organizationId,
      action: `Criou webhook para ${new URL(input.url).host}`,
      type: "seguranca",
      target: endpoint.id,
    });
    return { ...endpoint, secret: secret.plaintext };
  },

  async update(
    actorUserId: string,
    organizationId: string,
    id: string,
    input: Partial<WebhookInput> & { enabled?: boolean },
  ) {
    if (input.url !== undefined) assertWebhookUrl(input.url);
    const endpoint = await endpointsRepository.update(organizationId, id, input);
    if (!endpoint) throw new WebhookNotFoundError();
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Alterou webhook",
      type: "seguranca",
      target: id,
    });
    return endpoint;
  },

  async rotateSecret(actorUserId: string, organizationId: string, id: string) {
    const secret = newSecret();
    const endpoint = await endpointsRepository.update(organizationId, id, {
      secret: secret.sealed,
    });
    if (!endpoint) throw new WebhookNotFoundError();
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Trocou o segredo do webhook",
      type: "seguranca",
      target: id,
    });
    return { secret: secret.plaintext };
  },

  async remove(actorUserId: string, organizationId: string, id: string) {
    if (!(await endpointsRepository.remove(organizationId, id))) throw new WebhookNotFoundError();
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Excluiu webhook",
      type: "seguranca",
      target: id,
    });
  },

  listDeliveries(organizationId: string, endpointId: string) {
    return deliveriesRepository.listForEndpoint(organizationId, endpointId);
  },

  /**
   * Registra o evento para cada webhook que o assina e poe a entrega na fila.
   * Melhor esforco: uma falha aqui nunca derruba a acao que gerou o evento
   * (a mensagem do visitante ja foi gravada, por exemplo).
   */
  async emit(organizationId: string, event: WebhookEvent, data: Record<string, unknown>) {
    try {
      const endpoints = await endpointsRepository.subscribedTo(organizationId, event);
      for (const endpoint of endpoints) {
        const delivery = await deliveriesRepository.insert(organizationId, endpoint.id, event, {
          event,
          organizationId,
          occurredAt: new Date().toISOString(),
          data,
        });
        await enqueueWebhookDelivery(delivery.id);
      }
    } catch (err) {
      console.error(`webhook ${event} nao registrado:`, (err as Error).message);
    }
  },

  /** Evento de teste para o cliente conferir a assinatura. */
  async sendTest(organizationId: string, id: string) {
    const endpoint = (await endpointsRepository.list(organizationId)).find((e) => e.id === id);
    if (!endpoint) throw new WebhookNotFoundError();
    const delivery = await deliveriesRepository.insert(organizationId, id, "teste", {
      event: "teste",
      organizationId,
      occurredAt: new Date().toISOString(),
      data: { message: "Entrega de teste do ChatRAG" },
    });
    await enqueueWebhookDelivery(delivery.id);
    return delivery;
  },
};
