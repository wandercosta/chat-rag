import crypto from "node:crypto";

/**
 * TOTP (RFC 6238) com HMAC-SHA1, 6 digitos e passo de 30 segundos: o padrao
 * que Google Authenticator, Microsoft Authenticator, 1Password e afins leem.
 * Sem dependencia: e pouco codigo e fica testado com os vetores da RFC.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("base32 invalido");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160 bits aleatorios, como recomenda a RFC 4226. */
export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function timeStep(at: Date = new Date()) {
  return Math.floor(at.getTime() / 1000 / STEP_SECONDS);
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, "0");
}

/**
 * Aceita o passo atual e um para cada lado (relogio do celular um pouco fora).
 * Devolve o passo que bateu, para impedir reuso do mesmo codigo, ou null.
 */
export function verifyTotp(secret: string, code: string, at: Date = new Date()): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const now = timeStep(at);
  for (const step of [now - 1, now, now + 1]) {
    const expected = totpAt(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string, issuer = "ChatRAG") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/** Codigos de recuperacao no formato xxxx-xxxx (sem letras que confundem). */
export function generateRecoveryCodes(count = 10): string[] {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: count }, () => {
    const pick = () => Array.from(crypto.randomBytes(4), (b) => chars[b % chars.length]).join("");
    return `${pick()}-${pick()}`;
  });
}

export function hashRecoveryCode(code: string) {
  return crypto.createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}
