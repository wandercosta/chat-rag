/**
 * Webhooks de saida (ADR-006, etapa 8): eventos assinados com HMAC entregues
 * pela fila com novas tentativas. Interface publica do modulo (ADR-002 #2).
 */
export { webhooksService } from "./webhooks.service.js";
export { webhooksRoutes } from "./webhooks.routes.js";
export { processWebhookDelivery, signPayload } from "./delivery.js";
export { WEBHOOK_EVENTS, type WebhookEvent } from "./events.js";
export { isPrivateAddress } from "./url-guard.js";
