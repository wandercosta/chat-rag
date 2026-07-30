import { describe, expect, it } from "vitest";
import { generateEmbedKey, hashEmbedKey, maskEmbedKey } from "./keys.crypto.js";

describe("keys.crypto", () => {
  it("prefixes the key by environment", () => {
    expect(generateEmbedKey("producao").startsWith("pk_live_")).toBe(true);
    expect(generateEmbedKey("teste").startsWith("pk_test_")).toBe(true);
  });

  it("hashes deterministically", () => {
    const key = generateEmbedKey("teste");
    expect(hashEmbedKey(key)).toBe(hashEmbedKey(key));
  });

  it("masks the key without exposing the middle section", () => {
    const key = generateEmbedKey("teste");
    const masked = maskEmbedKey(key);
    expect(masked).not.toBe(key);
    expect(masked.startsWith(key.slice(0, 8))).toBe(true);
    expect(masked.endsWith(key.slice(-4))).toBe(true);
  });
});
