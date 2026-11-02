import { env } from "../../config/env.js";
import type { AttachmentKind } from "../../db/types.js";
import { ChannelApiError } from "./http.js";
import { graph } from "./whatsapp.client.js";

/** Arquivo do atendente pronto para sair por um canal. */
export interface OutboundMedia {
  kind: AttachmentKind;
  mimeType: string;
  fileName: string;
  /** Texto que o atendente escreveu junto (null = so o arquivo). */
  caption: string | null;
  read(): Promise<Buffer>;
  /** Link publico temporario (Instagram so aceita arquivo por URL). */
  publicUrl: string | null;
}

/** Envio multipart: o fetch monta o boundary, entao sem Content-Type nosso. */
async function multipart<T>(
  url: string,
  form: FormData,
  headers: Record<string, string>,
  describe: (body: unknown) => string | undefined,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", body: form, headers });
  } catch {
    throw new ChannelApiError(503, "nao foi possivel falar com o provedor do canal");
  }
  const body = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new ChannelApiError(response.status, describe(body) ?? `erro ${response.status}`);
  }
  return body;
}

const metaError = (body: unknown) => (body as { error?: { message?: string } }).error?.message;

async function fileBlob(media: OutboundMedia) {
  return new Blob([new Uint8Array(await media.read())], { type: media.mimeType });
}

const WHATSAPP_TYPE: Record<AttachmentKind, string> = {
  imagem: "image",
  video: "video",
  audio: "audio",
  documento: "document",
  figurinha: "sticker",
};

/** WhatsApp: sobe o arquivo (`/{numero}/media`) e manda a mensagem com o id. */
export async function sendWhatsAppMedia(
  phoneNumberId: string,
  token: string,
  to: string,
  media: OutboundMedia,
) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", media.mimeType);
  form.append("file", await fileBlob(media), media.fileName);
  const uploaded = await multipart<{ id?: string }>(
    `${env.META_GRAPH_URL}/${encodeURIComponent(phoneNumberId)}/media`,
    form,
    { Authorization: `Bearer ${token}` },
    metaError,
  );
  if (!uploaded.id) throw new ChannelApiError(502, "o WhatsApp nao devolveu o id do arquivo");

  const type = WHATSAPP_TYPE[media.kind];
  const result = await graph<{ messages?: { id: string }[] }>(
    `/${encodeURIComponent(phoneNumberId)}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type,
        [type]: {
          id: uploaded.id,
          // Audio nao tem legenda no WhatsApp; documento leva o nome.
          ...(media.caption && type !== "audio" && { caption: media.caption }),
          ...(type === "document" && { filename: media.fileName }),
        },
      }),
    },
  );
  return result.messages?.[0]?.id ?? null;
}

const TELEGRAM_METHOD: Record<AttachmentKind, [method: string, field: string]> = {
  imagem: ["sendPhoto", "photo"],
  video: ["sendVideo", "video"],
  audio: ["sendAudio", "audio"],
  documento: ["sendDocument", "document"],
  figurinha: ["sendDocument", "document"],
};

/** Telegram: o arquivo vai no proprio pedido. O token vai na URL: nunca logar. */
export async function sendTelegramMedia(token: string, chatId: string, media: OutboundMedia) {
  const [method, field] = TELEGRAM_METHOD[media.kind];
  const form = new FormData();
  form.append("chat_id", chatId);
  if (media.caption) form.append("caption", media.caption.slice(0, 1024));
  form.append(field, await fileBlob(media), media.fileName);
  const result = await multipart<{ result?: { message_id: number } }>(
    `${env.TELEGRAM_API_URL}/bot${token}/${method}`,
    form,
    {},
    (b) => (b as { description?: string }).description,
  );
  if (!result.result) throw new ChannelApiError(502, "o Telegram nao confirmou o envio");
  return `${chatId}:${result.result.message_id}`;
}

const META_TYPE: Record<AttachmentKind, string> = {
  imagem: "image",
  video: "video",
  audio: "audio",
  documento: "file",
  figurinha: "image",
};

function messagingType(humanAgent?: boolean) {
  return humanAgent
    ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
    : { messaging_type: "RESPONSE" };
}

async function sendMetaAttachment(
  pageId: string,
  token: string,
  recipientId: string,
  attachment: { type: string; payload: Record<string, unknown> },
  humanAgent?: boolean,
) {
  const result = await graph<{ message_id?: string }>(
    `/${encodeURIComponent(pageId)}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        recipient: { id: recipientId },
        ...messagingType(humanAgent),
        message: { attachment },
      }),
    },
  );
  return result.message_id ?? null;
}

/** Messenger: sobe o arquivo (`message_attachments`) e manda pelo id. */
export async function sendMessengerMedia(
  pageId: string,
  token: string,
  recipientId: string,
  media: OutboundMedia,
  humanAgent?: boolean,
) {
  const type = META_TYPE[media.kind];
  const form = new FormData();
  form.append("message", JSON.stringify({ attachment: { type, payload: { is_reusable: false } } }));
  form.append("filedata", await fileBlob(media), media.fileName);
  const uploaded = await multipart<{ attachment_id?: string }>(
    `${env.META_GRAPH_URL}/${encodeURIComponent(pageId)}/message_attachments`,
    form,
    { Authorization: `Bearer ${token}` },
    metaError,
  );
  if (!uploaded.attachment_id) {
    throw new ChannelApiError(502, "o Messenger nao devolveu o id do arquivo");
  }
  return sendMetaAttachment(
    pageId,
    token,
    recipientId,
    { type, payload: { attachment_id: uploaded.attachment_id } },
    humanAgent,
  );
}

/** Instagram: so por URL publica (o link assinado e temporario do arquivo). */
export function sendInstagramMedia(
  pageId: string,
  token: string,
  recipientId: string,
  media: OutboundMedia,
  humanAgent?: boolean,
) {
  if (!media.publicUrl) {
    throw new ChannelApiError(422, "o Instagram precisa de PUBLIC_API_URL para receber arquivo");
  }
  return sendMetaAttachment(
    pageId,
    token,
    recipientId,
    { type: META_TYPE[media.kind], payload: { url: media.publicUrl } },
    humanAgent,
  );
}
