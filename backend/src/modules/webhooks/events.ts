/** Eventos que um webhook de saida pode assinar (ADR-006, etapa 8). */
export const WEBHOOK_EVENTS = [
  "mensagem.recebida",
  "conversa.resolvida",
  "contato.criado",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
