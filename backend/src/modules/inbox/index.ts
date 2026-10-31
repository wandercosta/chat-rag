/**
 * Caixa de entrada compartilhada (ADR-006): status e atribuicao das conversas,
 * resposta humana, notas internas e respostas prontas. Interface publica do
 * modulo (ADR-002 #2).
 */
export { inboxService, AssignedToAnotherUserError, OutsideWindowError } from "./inbox.service.js";
export type { InboxActor } from "./inbox.service.js";
export { inboxRoutes } from "./inbox.routes.js";
export { setReplyWindowPolicy } from "./reply.js";
export { cannedResponsesRoutes } from "./canned-responses.routes.js";
export { sectorsRoutes } from "./sectors.routes.js";
export { inboxSettingsRoutes } from "./settings.routes.js";
export { agentMetricsRoutes } from "./metrics.routes.js";
