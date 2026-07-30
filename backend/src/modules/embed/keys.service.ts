import { auditService } from "../audit/index.js";
import { domainsRepository } from "./domains.repository.js";
import { generateEmbedKey, hashEmbedKey, maskEmbedKey } from "./keys.crypto.js";
import { keysRepository } from "./keys.repository.js";

export class NoDomainsError extends Error {}

export const keysService = {
  list(organizationId: string) {
    return keysRepository.listForOrganization(organizationId);
  },

  /** Dominios autorizados sao obrigatorios desde a criacao (ADR-001 #9). */
  async create(
    actorUserId: string,
    organizationId: string,
    assistantId: string,
    environment: "teste" | "producao",
    domains: string[],
  ) {
    if (domains.length === 0) throw new NoDomainsError();

    const plaintext = generateEmbedKey(environment);
    const row = await keysRepository.insert(
      organizationId,
      assistantId,
      environment,
      hashEmbedKey(plaintext),
      maskEmbedKey(plaintext),
    );

    await Promise.all(domains.map((domain) => domainsRepository.add(row.id, domain)));

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou chave de widget",
      type: "seguranca",
      target: `ambiente: ${environment} · ${row.masked}`,
    });

    // O valor em texto puro so existe nesta resposta; nunca e persistido nem devolvido depois.
    return { id: row.id, environment: row.environment, masked: row.masked, plaintext };
  },

  async revoke(actorUserId: string, organizationId: string, id: string) {
    await keysRepository.revoke(organizationId, id);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Revogou chave de widget",
      type: "seguranca",
      target: id,
    });
  },

  addDomain(embedKeyId: string, domain: string) {
    return domainsRepository.add(embedKeyId, domain);
  },

  removeDomain(embedKeyId: string, domainId: string) {
    return domainsRepository.remove(embedKeyId, domainId);
  },

  listDomains(embedKeyId: string) {
    return domainsRepository.listForKey(embedKeyId);
  },
};
