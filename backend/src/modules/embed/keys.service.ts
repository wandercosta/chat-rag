import { auditService } from "../audit/index.js";
import { encryptSecret, maskSecret, serializeEnvelope } from "../../crypto/envelope.js";
import { generateIdentitySecret } from "./identity-token.js";
import { domainsRepository } from "./domains.repository.js";
import { generateEmbedKey, hashEmbedKey, maskEmbedKey } from "./keys.crypto.js";
import { keysRepository } from "./keys.repository.js";

export class NoDomainsError extends Error {}
export class KeyNotFoundError extends Error {}
/** Exigir assinatura sem segredo cadastrado deixaria o widget sem identidade alguma. */
export class NoIdentitySecretError extends Error {}

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

  /**
   * Chave com valor conhecido, so para o seed de demonstracao (DEMO_WIDGET_KEY).
   * Idempotente: se a chave ja existe, nao cria outra. Continua guardando so o
   * hash, como qualquer chave.
   */
  async ensureDemoKey(
    organizationId: string,
    assistantId: string,
    plaintext: string,
    domains: string[],
  ) {
    const existing = await keysRepository.findActiveByHash(hashEmbedKey(plaintext));
    if (existing) return { id: existing.id, created: false };

    const row = await keysRepository.insert(
      organizationId,
      assistantId,
      "teste",
      hashEmbedKey(plaintext),
      maskEmbedKey(plaintext),
    );
    await Promise.all(domains.map((domain) => domainsRepository.add(row.id, domain)));
    return { id: row.id, created: true };
  },

  /**
   * Gera (ou troca) o segredo de identidade da chave. O texto so existe nesta
   * resposta: fica cifrado (envelope) porque precisa voltar a texto para
   * conferir a assinatura, e o painel so ve o final.
   */
  async rotateIdentitySecret(actorUserId: string, organizationId: string, id: string) {
    const secret = generateIdentitySecret();
    const updated = await keysRepository.setIdentitySecret(organizationId, id, {
      envelope: JSON.stringify(serializeEnvelope(encryptSecret(secret))),
      hint: maskSecret(secret),
    });
    if (!updated) throw new KeyNotFoundError();
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Gerou segredo de identidade do widget",
      type: "seguranca",
      target: id,
    });
    return { secret, hint: maskSecret(secret) };
  },

  async removeIdentitySecret(actorUserId: string, organizationId: string, id: string) {
    if (!(await keysRepository.setIdentitySecret(organizationId, id, null))) {
      throw new KeyNotFoundError();
    }
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Removeu segredo de identidade do widget",
      type: "seguranca",
      target: id,
    });
  },

  async setRequireSignedIdentity(
    actorUserId: string,
    organizationId: string,
    id: string,
    on: boolean,
  ) {
    const key = await keysRepository.findById(organizationId, id);
    if (!key) throw new KeyNotFoundError();
    if (on && !key.identity_secret) throw new NoIdentitySecretError();
    await keysRepository.setRequireSignedIdentity(organizationId, id, on);
    await auditService.record({
      actorUserId,
      organizationId,
      action: on
        ? "Passou a exigir identidade assinada no widget"
        : "Deixou de exigir identidade assinada no widget",
      type: "seguranca",
      target: id,
    });
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
