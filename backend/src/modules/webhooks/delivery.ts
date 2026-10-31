import crypto from "node:crypto";
import { decryptSecret, deserializeEnvelope } from "../../crypto/envelope.js";
import { WEBHOOK_MAX_ATTEMPTS } from "../../queue/webhooks.queue.js";
import { deliveriesRepository } from "./deliveries.repository.js";
import { endpointsRepository } from "./endpoints.repository.js";
import { assertPublicTarget, assertWebhookUrl } from "./url-guard.js";

const TIMEOUT_MS = 10_000;

/**
 * Assinatura no estilo "t=,v1=": HMAC-SHA256 de `${t}.${corpo}` com o segredo
 * do webhook. O carimbo de tempo entra na assinatura para o cliente recusar
 * reenvios antigos (docs/integrations/api-e-webhooks.md).
 */
export function signPayload(secret: string, timestamp: number, body: string) {
  const v1 = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

class DeliveryFailedError extends Error {}

/**
 * Uma tentativa de entrega (job da fila). Lanca erro para a fila tentar de
 * novo; na ultima tentativa a entrega fica como "falhou".
 */
export async function processWebhookDelivery(deliveryId: string, attempt: number) {
  const delivery = await deliveriesRepository.find(deliveryId);
  if (!delivery || delivery.status !== "pendente") return;
  const endpoint = await endpointsRepository.findWithSecret(delivery.endpoint_id);
  if (!endpoint || !endpoint.enabled) {
    await deliveriesRepository.record(deliveryId, {
      status: "falhou",
      attempts: attempt,
      statusCode: null,
      error: "webhook desligado ou excluido",
    });
    return;
  }

  const body = JSON.stringify({ id: delivery.id, ...delivery.payload });
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const url = assertWebhookUrl(endpoint.url);
    await assertPublicTarget(url);
    const secret = decryptSecret(deserializeEnvelope(endpoint.secret));
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ChatRAG-Webhooks/1",
        "X-ChatRAG-Event": delivery.event,
        "X-ChatRAG-Delivery": delivery.id,
        "X-ChatRAG-Signature": signPayload(secret, Math.floor(Date.now() / 1000), body),
      },
      body,
    });
    statusCode = response.status;
    await response.body?.cancel().catch(() => undefined);
    if (response.status < 200 || response.status >= 300) error = `HTTP ${response.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 300) : "falha de rede";
  }

  if (!error) {
    await deliveriesRepository.record(deliveryId, {
      status: "entregue",
      attempts: attempt,
      statusCode,
      error: null,
    });
    return;
  }
  const last = attempt >= WEBHOOK_MAX_ATTEMPTS;
  await deliveriesRepository.record(deliveryId, {
    status: last ? "falhou" : "pendente",
    attempts: attempt,
    statusCode,
    error,
  });
  if (!last) throw new DeliveryFailedError(error);
}
