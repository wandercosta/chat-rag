import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./envelope.js";

describe("ai-credentials envelope", () => {
  it("round-trips a secret through encrypt/decrypt", () => {
    const envelope = encryptSecret("sk-test-1234567890abcdef");
    expect(decryptSecret(envelope)).toBe("sk-test-1234567890abcdef");
  });

  it("produces different ciphertext for the same plaintext (random DEK/IV per call)", () => {
    const a = encryptSecret("sk-test-1234567890abcdef");
    const b = encryptSecret("sk-test-1234567890abcdef");
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("fails to decrypt if the ciphertext is tampered with", () => {
    const envelope = encryptSecret("sk-test-1234567890abcdef");
    envelope.ciphertext[0] = envelope.ciphertext[0] ^ 0xff;
    expect(() => decryptSecret(envelope)).toThrow();
  });

  it("masks a secret keeping only a short prefix and the last 4 chars", () => {
    const masked = maskSecret("sk-test-1234567890abcdef");
    expect(masked.endsWith("cdef")).toBe(true);
    expect(masked).not.toContain("1234567890");
  });
});

describe("envelope serializado", () => {
  it("volta ao mesmo segredo depois de virar JSON", async () => {
    const { deserializeEnvelope, serializeEnvelope } = await import("./envelope.js");
    const stored = JSON.parse(JSON.stringify(serializeEnvelope(encryptSecret("token-de-teste"))));
    expect(decryptSecret(deserializeEnvelope(stored))).toBe("token-de-teste");
  });
});
