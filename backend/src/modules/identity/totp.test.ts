import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateSecret,
  totpAt,
  verifyTotp,
} from "./totp.js";

// Segredo dos vetores de teste da RFC 6238 (SHA1): "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("bate com os vetores da RFC (6 ultimos digitos)", () => {
    const cases: [number, string][] = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
    ];
    for (const [seconds, code] of cases) {
      expect(totpAt(RFC_SECRET, Math.floor(seconds / 30))).toBe(code);
    }
  });

  it("aceita um passo de folga e recusa codigo velho ou mal formado", () => {
    const at = new Date(1111111111 * 1000);
    const step = Math.floor(1111111111 / 30);
    expect(verifyTotp(RFC_SECRET, "050471", at)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), at)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 3), at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abc123", at)).toBeNull();
  });

  it("base32 vai e volta; segredo e codigos de recuperacao tem o formato certo", () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});
