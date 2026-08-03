import { supportSessionsRepository } from "./support-sessions.repository.js";

/**
 * So a mecanica pura de sessao (usada por requireOrgRole/requireMasterSupportSession
 * abaixo). O registro de auditoria de inicio/fim fica no modulo organizations,
 * que ja depende de identity e de audit — identity nunca depende de audit,
 * para nao criar ciclo com os guards que audit importa daqui.
 */
export const supportSessionsService = {
  start(masterUserId: string, organizationId: string, justification: string, minutes: number) {
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    return supportSessionsRepository.insert(masterUserId, organizationId, justification, expiresAt);
  },

  end(id: string) {
    return supportSessionsRepository.end(id);
  },

  async hasActive(masterUserId: string, organizationId: string): Promise<boolean> {
    if (!organizationId || organizationId === "null" || organizationId === "undefined") {
      return false;
    }
    const row = await supportSessionsRepository.findActive(masterUserId, organizationId);
    return Boolean(row);
  },

  listForOrganization(organizationId: string) {
    return supportSessionsRepository.listForOrganization(organizationId);
  },
};
