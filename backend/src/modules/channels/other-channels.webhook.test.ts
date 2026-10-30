import { describe, expect, it } from "vitest";
import { parseMessagingWebhook } from "./meta-messaging.js";
import { parseTelegramUpdate, verifySecretToken } from "./telegram.js";

describe("webhook do Messenger e do Instagram", () => {
  const payload = (accountId: string) => ({
    object: "page",
    entry: [
      {
        id: accountId,
        messaging: [
          { sender: { id: "psid-1" }, message: { mid: "m_1", text: " Oi " } },
          { sender: { id: "psid-1" }, message: { mid: "m_2", attachments: [{ type: "image" }] } },
          { sender: { id: "pagina" }, message: { mid: "m_3", text: "eco", is_echo: true } },
          { sender: { id: "psid-1" }, delivery: { mids: ["m_out_9"] } },
        ],
      },
    ],
  });

  it("normaliza texto e anexo, ignora eco e le o recibo de entrega", () => {
    expect(parseMessagingWebhook(payload("123"), "123")).toEqual({
      messages: [
        { providerMessageId: "m_1", from: "psid-1", name: null, text: "Oi" },
        { providerMessageId: "m_2", from: "psid-1", name: null, text: "[imagem recebida]" },
      ],
      statuses: [{ providerMessageId: "m_out_9", status: "entregue", error: null }],
    });
  });

  it("ignora eventos de outra Pagina", () => {
    expect(parseMessagingWebhook(payload("999"), "123")).toEqual({ messages: [], statuses: [] });
  });
});

describe("update do Telegram", () => {
  const update = (chatType: string, text?: string, extra = {}) => ({
    update_id: 1,
    message: {
      message_id: 42,
      chat: { id: 555, type: chatType },
      from: { first_name: "Ana", last_name: "Lima", username: "analima" },
      text,
      ...extra,
    },
  });

  it("usa chat:mensagem como id e o nome do remetente", () => {
    expect(parseTelegramUpdate(update("private", "Oi bot")).messages).toEqual([
      { providerMessageId: "555:42", from: "555", name: "Ana Lima", text: "Oi bot" },
    ]);
  });

  it("ignora grupo, /start e mensagem vazia; rotula midia", () => {
    expect(parseTelegramUpdate(update("group", "oi")).messages).toEqual([]);
    expect(parseTelegramUpdate(update("private", "/start")).messages).toEqual([]);
    expect(parseTelegramUpdate({ update_id: 2 }).messages).toEqual([]);
    expect(parseTelegramUpdate(update("private", undefined, { photo: [] })).messages[0].text).toBe(
      "[imagem recebida]",
    );
  });

  it("confere o token secreto em tempo constante", () => {
    expect(verifySecretToken("abc", "abc")).toBe(true);
    expect(verifySecretToken("abd", "abc")).toBe(false);
    expect(verifySecretToken(undefined, "abc")).toBe(false);
  });
});
