import crypto from "node:crypto";
import { env } from "../../config/env.js";

/** Chave propria para os links: derivada da chave mestra, nunca ela mesma. */
const linkKey = crypto.createHmac("sha256", env.APP_MASTER_KEY).update("media-link:v1").digest();

function signature(attachmentId: string, expiresAt: number) {
  return crypto
    .createHmac("sha256", linkKey)
    .update(`${attachmentId}.${expiresAt}`)
    .digest("base64url");
}

/**
 * Link publico e temporario de um arquivo enviado por atendente (widget e
 * Instagram, que so aceitam arquivo por URL). Sem sessao: quem tem o link
 * baixa ate `exp`. Arquivo recebido do cliente nunca sai por aqui.
 */
export function signedMediaPath(attachmentId: string, ttlSeconds: number) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/media/${attachmentId}?exp=${exp}&sig=${signature(attachmentId, exp)}`;
}

export function verifyMediaLink(attachmentId: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(signature(attachmentId, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
