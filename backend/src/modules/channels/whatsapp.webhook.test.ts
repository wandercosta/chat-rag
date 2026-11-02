import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhook, verifySignature } from "./whatsapp.webhook.js";

const sign = (body: string, secret: string) =>
  `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

describe("assinatura do webhook", () => {
  const body = '{"object":"whatsapp_business_account"}';

  it("aceita a assinatura do segredo certo e recusa o resto", () => {
    expect(verifySignature(Buffer.from(body), sign(body, "segredo"), "segredo")).toBe(true);
    expect(verifySignature(Buffer.from(body), sign(body, "outro"), "segredo")).toBe(false);
    expect(verifySignature(Buffer.from(`${body} `), sign(body, "segredo"), "segredo")).toBe(false);
    expect(verifySignature(Buffer.from(body), undefined, "segredo")).toBe(false);
    expect(verifySignature(Buffer.from(body), "sha256=abc", "segredo")).toBe(false);
  });
});

describe("payload do WhatsApp", () => {
  const payload = (phoneNumberId: string) => ({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: "5511999998888", profile: { name: "Maria" } }],
              messages: [
                { id: "wamid.1", from: "5511999998888", type: "text", text: { body: " Oi " } },
                { id: "wamid.2", from: "5511999998888", type: "image" },
                { id: "wamid.3", from: "5511999998888", type: "reaction" },
              ],
              statuses: [
                { id: "wamid.out", status: "read" },
                { id: "wamid.err", status: "failed", errors: [{ title: "Re-engagement" }] },
                { id: "wamid.x", status: "deleted" },
              ],
            },
          },
        ],
      },
    ],
  });

  it("normaliza texto, midia e recibos, ignorando reacao", () => {
    expect(parseWhatsAppWebhook(payload("123"), "123")).toEqual({
      messages: [
        { providerMessageId: "wamid.1", from: "5511999998888", name: "Maria", text: "Oi" },
        {
          providerMessageId: "wamid.2",
          from: "5511999998888",
          name: "Maria",
          text: "[imagem recebida]",
        },
      ],
      statuses: [
        { providerMessageId: "wamid.out", status: "lida", error: null },
        { providerMessageId: "wamid.err", status: "falhou", error: "Re-engagement" },
      ],
    });
  });

  it("ignora o que vier de outro numero", () => {
    expect(parseWhatsAppWebhook(payload("999"), "123")).toEqual({ messages: [], statuses: [] });
  });
});
