/**
 * Campanhas (ADR-006 #9, etapa 6): publico por segmento com opt-in, modelo
 * aprovado (WhatsApp) ou texto (Telegram), agendamento, ritmo por organizacao
 * e metricas. Interface publica do modulo (ADR-002 #2).
 */
export { campaignsService } from "./campaigns.service.js";
export { campaignsRoutes } from "./campaigns.routes.js";
export { runCampaignTick } from "./sender.js";
