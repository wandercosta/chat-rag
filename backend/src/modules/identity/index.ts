/**
 * Interface publica do modulo identity. Outros modulos so podem importar
 * daqui — nunca de repository.ts, service.ts etc. diretamente (ADR-002 #2).
 */
export { identityPlugin, requireSession, requireMaster, requireOrgRole } from "./plugin.js";
export { identityService } from "./service.js";
export type { AuthContext } from "./types.js";
