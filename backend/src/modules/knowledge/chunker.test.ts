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

describe("chunkText boundaries", () => {
  const sentence = (i: number) => `Art. ${i}. O consumidor tem o direito numero ${i} garantido por lei.`;
  const text = Array.from({ length: 60 }, (_, i) => sentence(i + 1)).join(" ");

  it("ends chunks at a sentence boundary when one is close", () => {
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(0, -1)) expect(chunk).toMatch(/[.;!?]$/);
  });

  it("never starts a chunk in the middle of a word", () => {
    const words = new Set(text.split(" "));
    for (const chunk of chunkText(text)) expect(words.has(chunk.split(" ")[0])).toBe(true);
  });
});
