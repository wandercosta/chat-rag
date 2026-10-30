/**
 * Canais oficiais (ADR-006 #6 e #7): conexoes do tenant, webhooks de entrada,
 * envio, modelos e recibos. Interface publica do modulo (ADR-002 #2).
 */
export { channelsRoutes } from "./channels.routes.js";
export { channelsWebhookRoutes } from "./webhook.routes.js";
export { processChannelJob } from "./jobs.js";
export { sendToContact, channelsQuery, renderTemplate } from "./outbound.service.js";
export type { OutboundContent, OutboundResult } from "./outbound.service.js";
