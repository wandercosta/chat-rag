import type { VisitorProfileInput } from "../conversations/index.js";
import { decryptSecret, deserializeEnvelope } from "../../crypto/envelope.js";
import { InvalidIdentityTokenError, verifyIdentityToken } from "./identity-token.js";
import type { ResolvedEmbedKey } from "./public-access.service.js";

export { InvalidIdentityTokenError };

interface IdentityFields {
  identityToken?: string;
  externalUserId?: string;
  visitorName?: string;
  visitorEmail?: string;
  context?: Record<string, unknown>;
}

/**
 * Quem e o visitante, conforme a chave do widget:
 * - com `identityToken`: so vale se a assinatura confere com o segredo da
 *   chave (senao, erro); a identidade e verificada;
 * - sem token e com a chave exigindo assinatura: anonimo (os campos data-*
 *   sao ignorados, inclusive o contexto);
 * - sem token e sem exigencia: os campos data-*, sem verificacao.
 */
export function visitorIdentity(key: ResolvedEmbedKey, body: IdentityFields): VisitorProfileInput {
  if (body.identityToken) {
    if (!key.identitySecret) {
      throw new InvalidIdentityTokenError("a chave nao tem segredo de identidade");
    }
    const secret = decryptSecret(deserializeEnvelope(key.identitySecret));
    const identity = verifyIdentityToken(body.identityToken, secret);
    return { ...identity, verified: true };
  }
  if (key.requireSignedIdentity) return {};
  return {
    externalUserId: body.externalUserId,
    name: body.visitorName,
    email: body.visitorEmail,
    context: body.context,
  };
}
