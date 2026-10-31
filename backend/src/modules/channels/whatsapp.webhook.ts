import crypto from "node:crypto";
import type { DeliveryStatus } from "../../db/types.js";
import type { AttachmentKind } from "../../db/types.js";
import type { InboundMedia, InboundMessage } from "../../queue/channel-messages.queue.js";

/**
 * Assinatura do webhook da Meta: `X-Hub-Signature-256: sha256=<hmac>` do corpo
 * cru com o segredo do app. Comparacao em tempo constante. Sem assinatura
 * valida, nada do corpo e processado (ADR-006 #7).
 */
export function verifySignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

const STATUS_MAP: Record<string, DeliveryStatus> = {
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "falhou",
};

/** Sem legenda, o texto da mensagem e o tipo da midia (o arquivo vem a parte). */
const MEDIA_LABEL: Record<string, string> = {
  image: "[imagem recebida]",
  audio: "[audio recebido]",
  voice: "[audio recebido]",
  video: "[video recebido]",
  document: "[documento recebido]",
  sticker: "[figurinha recebida]",
  location: "[localizacao recebida]",
  contacts: "[contato compartilhado]",
};

const MEDIA_KIND: Record<string, AttachmentKind> = {
  image: "imagem",
  audio: "audio",
  voice: "audio",
  video: "video",
  document: "documento",
  sticker: "figurinha",
};

interface WaMedia {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
}

interface WaMessage {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  image?: WaMedia;
  audio?: WaMedia;
  voice?: WaMedia;
  video?: WaMedia;
  document?: WaMedia;
  sticker?: WaMedia;
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}

interface WaValue {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: {
    id: string;
    status: string;
    errors?: { title?: string; message?: string }[];
  }[];
}

function textOf(message: WaMessage): string | null {
  if (message.type === "text") return message.text?.body?.trim() || null;
  if (message.type === "button") return message.button?.text ?? null;
  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null
    );
  }
  const caption = mediaOf(message)?.caption?.trim();
  return caption || (MEDIA_LABEL[message.type] ?? null);
}

function mediaOf(message: WaMessage): WaMedia | undefined {
  return MEDIA_KIND[message.type]
    ? (message[message.type as keyof WaMessage] as WaMedia | undefined)
    : undefined;
}

function attachmentsOf(message: WaMessage): InboundMedia[] | undefined {
  const media = mediaOf(message);
  if (!media?.id) return undefined;
  return [
    {
      kind: MEDIA_KIND[message.type],
      ref: media.id,
      fileName: media.filename ?? null,
      mimeType: media.mime_type ?? null,
    },
  ];
}

export interface ParsedWebhook {
  messages: InboundMessage[];
  statuses: { providerMessageId: string; status: DeliveryStatus; error: string | null }[];
}

/**
 * Normaliza o payload do WhatsApp Cloud API. So entram mudancas do proprio
 * numero da conexao (`phone_number_id`): um corpo que fale de outro numero e
 * ignorado, mesmo assinado.
 */
export function parseWhatsAppWebhook(payload: unknown, phoneNumberId: string): ParsedWebhook {
  const result: ParsedWebhook = { messages: [], statuses: [] };
  const entries = (payload as { entry?: { changes?: { value?: WaValue }[] }[] })?.entry ?? [];

  for (const change of entries.flatMap((e) => e.changes ?? [])) {
    const value = change.value;
    if (!value || value.metadata?.phone_number_id !== phoneNumberId) continue;

    const names = new Map(
      (value.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? null]),
    );
    for (const message of value.messages ?? []) {
      const text = textOf(message);
      if (!text) continue; // reacao, mensagem apagada etc.
      result.messages.push({
        providerMessageId: message.id,
        from: message.from,
        name: names.get(message.from) ?? null,
        text,
        media: attachmentsOf(message),
      });
    }
    for (const status of value.statuses ?? []) {
      const mapped = STATUS_MAP[status.status];
      if (!mapped) continue;
      const error = status.errors?.[0];
      result.statuses.push({
        providerMessageId: status.id,
        status: mapped,
        error: error ? (error.message ?? error.title ?? "falha no envio") : null,
      });
    }
  }
  return result;
}
