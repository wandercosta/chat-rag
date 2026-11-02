/**
 * Automacoes (ADR-006 #4, etapa 7): regras deterministicas publicadas por uma
 * pessoa, com gatilho, condicoes e acoes, e historico de execucoes.
 * Interface publica do modulo (ADR-002 #2).
 */
export { automationsService } from "./automations.service.js";
export { automationsRoutes } from "./automations.routes.js";
export { onIncomingMessage, scanAllNoReply, scanNoReply } from "./engine.js";
export type { MessageOutcome } from "./engine.js";
export { onTagAdded } from "./tag-trigger.js";
export { setTemplateSender } from "./template-sender.js";
export type { TemplateSender } from "./template-sender.js";
