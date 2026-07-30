import { describe, expect, it } from "vitest";
import { chunkText } from "./chunker.js";

describe("chunkText", () => {
  it("returns an empty array for blank input", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const chunks = chunkText("um texto curto de teste");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("um texto curto de teste");
  });

  it("splits long text into multiple overlapping chunks", () => {
    const longText = Array.from({ length: 500 }, (_, i) => `palavra${i}`).join(" ");
    const chunks = chunkText(longText);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1000);
    }
  });

  it("never produces empty chunks", () => {
    const longText = "a ".repeat(2000);
    const chunks = chunkText(longText);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
  });
});
