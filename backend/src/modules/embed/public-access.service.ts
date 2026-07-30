import { domainsRepository } from "./domains.repository.js";
import { hashEmbedKey } from "./keys.crypto.js";
import { keysRepository } from "./keys.repository.js";

export class InvalidKeyError extends Error {}
export class DomainNotAllowedError extends Error {}

export interface ResolvedEmbedKey {
  id: string;
  organizationId: string;
  assistantId: string;
  environment: "teste" | "producao";
}

function hostnameFrom(originOrReferer: string | undefined): string | null {
  if (!originOrReferer) return null;
  try {
    return new URL(originOrReferer).hostname;
  } catch {
    return null;
  }
}

export const publicAccessService = {
  /** Toda rota publica do widget passa por aqui: chave valida + origem
   * autorizada, nunca uma das duas isoladamente (docs/security). */
  async resolveAndAuthorize(plaintextKey: string, originHeader: string | undefined): Promise<ResolvedEmbedKey> {
    const row = await keysRepository.findActiveByHash(hashEmbedKey(plaintextKey));
    if (!row) throw new InvalidKeyError();

    const host = hostnameFrom(originHeader);
    if (!host || !(await domainsRepository.isAllowed(row.id, host))) {
      throw new DomainNotAllowedError();
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      assistantId: row.assistant_id,
      environment: row.environment,
    };
  },
};
