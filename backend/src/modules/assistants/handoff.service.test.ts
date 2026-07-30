import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl } from "./handoff.service.js";

describe("buildWhatsAppUrl", () => {
  it("strips non-digit characters from the phone number", () => {
    const url = buildWhatsAppUrl("+55 (11) 91234-5678", "ola");
    expect(url).toBe("https://wa.me/5511912345678?text=ola");
  });

  it("url-encodes the question", () => {
    const url = buildWhatsAppUrl("5511999999999", "qual o prazo de entrega?");
    expect(url).toContain(encodeURIComponent("qual o prazo de entrega?"));
  });

  it("never includes raw unencoded spaces from the question", () => {
    const url = buildWhatsAppUrl("5511999999999", "duas palavras");
    expect(url).not.toContain("duas palavras");
  });
});
