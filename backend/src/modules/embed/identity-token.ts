import crypto from "node:crypto";

export class InvalidIdentityTokenError extends Error {}

export interface VerifiedIdentity {
  externalUserId: string;
  name?: string;
  email?: string;
  context?: Record<string, unknown>;
}

/** Validade maxima aceita: um token de longa duracao vazado vale pouco tempo. */
const MAX_LIFETIME_S = 24 * 60 * 60;

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** Gera o segredo que o backend do cliente usa para assinar (mostrado uma vez). */
export function generateIdentitySecret() {
  return `wis_${crypto.randomBytes(32).toString("base64url")}`;
}

/** So para testes e para o exemplo da documentacao: assina como o cliente faria. */
export function signIdentityToken(payload: Record<string, unknown>, secret: string) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64url(signature)}`;
}

/**
 * Token de identidade do visitante (JWT HS256) assinado pelo backend do
 * cliente com o segredo da chave do widget. Claims: `sub` (id do cliente no
 * sistema dele, obrigatorio), `exp` (obrigatorio, ate 24 horas no futuro),
 * `name`, `email` e `context` (objeto) opcionais. So HS256: `alg` diferente
 * (inclusive "none") e recusado.
 */
export function verifyIdentityToken(token: string, secret: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new InvalidIdentityTokenError("formato invalido");
  const [header, body, signature] = parts;

  let alg: unknown;
  let claims: Record<string, unknown>;
  try {
    alg = JSON.parse(Buffer.from(header, "base64url").toString("utf8")).alg;
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new InvalidIdentityTokenError("formato invalido");
  }
  if (alg !== "HS256") throw new InvalidIdentityTokenError("algoritmo nao aceito");

  const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw new InvalidIdentityTokenError("assinatura invalida");
  }

  const nowS = Math.floor(now / 1000);
  const exp = claims.exp;
  if (typeof exp !== "number" || exp <= nowS) throw new InvalidIdentityTokenError("token vencido");
  if (exp - nowS > MAX_LIFETIME_S)
    throw new InvalidIdentityTokenError("validade acima de 24 horas");

  const sub = claims.sub;
  if (typeof sub !== "string" || !sub || sub.length > 200) {
    throw new InvalidIdentityTokenError("sub obrigatorio");
  }
  const text = (value: unknown, max: number) =>
    typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;
  const context =
    claims.context && typeof claims.context === "object" && !Array.isArray(claims.context)
      ? (claims.context as Record<string, unknown>)
      : undefined;
  return {
    externalUserId: sub,
    name: text(claims.name, 200),
    email: text(claims.email, 320),
    context,
  } satisfies VerifiedIdentity;
}
