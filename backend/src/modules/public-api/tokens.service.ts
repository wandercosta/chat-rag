import crypto from "node:crypto";
import { auditService } from "../audit/index.js";
import { tokensRepository } from "./tokens.repository.js";

export const API_SCOPES = ["contacts:read", "contacts:write", "conversations:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const MAX_ACTIVE_TOKENS = 20;
export class TooManyTokensError extends Error {}
export class TokenNotFoundError extends Error {}

export interface ApiTokenContext {
  tokenId: string;
  organizationId: string;
  name: string;
  scopes: string[];
  /** Quem criou o token responde pelo que ele faz (ADR-006 #3). */
  createdBy: string | null;
}

const hashToken = (plaintext: string) =>
  crypto.createHash("sha256").update(plaintext).digest("hex");

export const tokensService = {
  list(organizationId: string) {
    return tokensRepository.list(organizationId);
  },

  /** O texto do token sai so nesta resposta; depois, so o prefixo. */
  async create(actorUserId: string, organizationId: string, name: string, scopes: ApiScope[]) {
    const { count } = await tokensRepository.countActive(organizationId);
    if (Number(count) >= MAX_ACTIVE_TOKENS) throw new TooManyTokensError();

    const plaintext = `crg_${crypto.randomBytes(32).toString("base64url")}`;
    const token = await tokensRepository.insert(organizationId, {
      name,
      prefix: plaintext.slice(0, 12),
      hash: hashToken(plaintext),
      scopes,
      createdBy: actorUserId,
    });
    await auditService.record({
      actorUserId,
      organizationId,
      action: `Criou token de API "${name}" (${scopes.join(", ")})`,
      type: "seguranca",
      target: token.id,
    });
    return { ...token, token: plaintext };
  },

  async revoke(actorUserId: string, organizationId: string, id: string) {
    const revoked = await tokensRepository.revoke(organizationId, id);
    if (!revoked) throw new TokenNotFoundError();
    await auditService.record({
      actorUserId,
      organizationId,
      action: `Revogou token de API "${revoked.name}"`,
      type: "seguranca",
      target: id,
    });
  },

  async authenticate(plaintext: string): Promise<ApiTokenContext | null> {
    if (!plaintext.startsWith("crg_")) return null;
    const row = await tokensRepository.findActiveByHash(hashToken(plaintext));
    if (!row) return null;
    // "Usado por ultimo" com precisao de minuto basta e evita um UPDATE por chamada.
    if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > 60_000) {
      await tokensRepository.touch(row.id);
    }
    return {
      tokenId: row.id,
      organizationId: row.organization_id,
      name: row.name,
      scopes: row.scopes,
      createdBy: row.created_by,
    };
  },
};
