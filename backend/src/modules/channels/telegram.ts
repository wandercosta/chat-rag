import crypto from "node:crypto";
import { env } from "../../config/env.js";
import type { AttachmentKind } from "../../db/types.js";
import type { InboundMedia } from "../../queue/channel-messages.queue.js";
import { ChannelApiError, requestJson } from "./http.js";
import type { ParsedWebhook } from "./whatsapp.webhook.js";

/** Bot API do Telegram (ADR-006 #6). O token do bot vai na URL: nunca logar a URL. */
function call<T>(token: string, method: string, body?: object) {
  return requestJson<{ ok: boolean; result: T }>(
    `${env.TELEGRAM_API_URL}/bot${token}/${method}`,
    { method: "POST", body: JSON.stringify(body ?? {}) },
    (b) => (b as { description?: string }).description,
  ).then((r) => r.result);
}

export const telegramClient = {
  getMe(token: string) {
    return call<{ id: number; username?: string; first_name?: string }>(token, "getMe");
  },

  /** O Telegram passa `secret_token` no cabecalho de cada entrega; e assim que
   * o webhook sabe que veio do Telegram (nao ha assinatura do corpo). */
  setWebhook(token: string, url: string, secretToken: string) {
    return call<boolean>(token, "setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message"],
    });
  },

  deleteWebhook(token: string) {
    return call<boolean>(token, "deleteWebhook");
  },

  /** Caminho do arquivo para baixar; o link leva o token, nunca logar. */
  async fileUrl(token: string, fileId: string) {
    const file = await call<{ file_path?: string }>(token, "getFile", { file_id: fileId });
    if (!file.file_path) throw new ChannelApiError(404, "o Telegram nao devolveu o arquivo");
    return `${env.TELEGRAM_API_URL}/file/bot${token}/${file.file_path}`;
  },

  /** Id composto "chat:mensagem": o message_id do Telegram so e unico no chat. */
  async sendText(token: string, chatId: string, text: string) {
    const message = await call<{ message_id: number }>(token, "sendMessage", {
      chat_id: chatId,
      text,
    });
    return `${chatId}:${message.message_id}`;
  },
};

export function verifySecretToken(header: string | undefined, expected: string): boolean {
  if (!header || header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

const MEDIA = ["photo", "voice", "audio", "video", "document", "sticker", "location"] as const;
const MEDIA_LABEL: Record<(typeof MEDIA)[number], string> = {
  photo: "[imagem recebida]",
  voice: "[audio recebido]",
  audio: "[audio recebido]",
  video: "[video recebido]",
  document: "[documento recebido]",
  sticker: "[figurinha recebida]",
  location: "[localizacao recebida]",
};

const MEDIA_KIND: Partial<Record<(typeof MEDIA)[number], AttachmentKind>> = {
  photo: "imagem",
  voice: "audio",
  audio: "audio",
  video: "video",
  document: "documento",
  sticker: "figurinha",
};

interface TelegramFile {
  file_id?: string;
  file_name?: string;
  mime_type?: string;
}

/** Foto chega em varios tamanhos; vale o maior (o ultimo). */
function mediaOf(
  kind: (typeof MEDIA)[number] | undefined,
  value: unknown,
): InboundMedia[] | undefined {
  const attachmentKind = kind && MEDIA_KIND[kind];
  if (!attachmentKind) return undefined;
  const file = (Array.isArray(value) ? value.at(-1) : value) as TelegramFile | undefined;
  if (!file?.file_id) return undefined;
  return [
    {
      kind: attachmentKind,
      ref: file.file_id,
      fileName: file.file_name ?? null,
      mimeType: file.mime_type ?? null,
    },
  ];
}

interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { first_name?: string; last_name?: string; username?: string };
    text?: string;
    caption?: string;
  } & Partial<Record<(typeof MEDIA)[number], unknown>>;
}

/**
 * So conversas privadas com o bot: mensagem de grupo ou canal nao e
 * atendimento. Midia sem legenda vira o rotulo do tipo; o arquivo e baixado
 * pelo worker.
 */
export function parseTelegramUpdate(payload: unknown): ParsedWebhook {
  const message = (payload as TelegramUpdate)?.message;
  if (!message || message.chat?.type !== "private") return { messages: [], statuses: [] };

  const media = MEDIA.find((kind) => message[kind] !== undefined);
  const text = message.text?.trim() || message.caption?.trim() || (media ? MEDIA_LABEL[media] : "");
  if (!text || text === "/start") return { messages: [], statuses: [] };

  const name = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ");
  return {
    messages: [
      {
        providerMessageId: `${message.chat.id}:${message.message_id}`,
        from: String(message.chat.id),
        name: name || message.from?.username || null,
        text,
        media: mediaOf(media, media ? message[media] : undefined),
      },
    ],
    statuses: [],
  };
}
