import type { AttachmentKind } from "../../db/types.js";
import type { InboundMedia } from "../../queue/channel-messages.queue.js";
import type { ParsedWebhook } from "./whatsapp.webhook.js";
import { graph } from "./whatsapp.client.js";

/**
 * Messenger e Instagram Direct pela plataforma de mensagens da Meta
 * (ADR-006 #6). Os dois usam o token da Pagina e o mesmo formato de webhook
 * (`entry[].messaging[]`); no Instagram a conversa sai pela Pagina ligada a
 * conta profissional.
 */
export const metaMessagingClient = {
  pageInfo(pageId: string, token: string) {
    return graph<{ name?: string }>(`/${encodeURIComponent(pageId)}?fields=name`, token);
  },

  instagramInfo(accountId: string, token: string) {
    return graph<{ username?: string }>(`/${encodeURIComponent(accountId)}?fields=username`, token);
  },

  /**
   * Fora das 24 horas, a resposta de um atendente sai com a tag HUMAN_AGENT
   * (ate 7 dias). Resposta do assistente nunca usa a tag: a Meta so a aceita
   * para mensagem escrita por uma pessoa.
   */
  async sendText(
    pageId: string,
    token: string,
    recipientId: string,
    text: string,
    options: { humanAgent?: boolean } = {},
  ) {
    const result = await graph<{ message_id?: string }>(
      `/${encodeURIComponent(pageId)}/messages`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          recipient: { id: recipientId },
          ...(options.humanAgent
            ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
            : { messaging_type: "RESPONSE" }),
          message: { text },
        }),
      },
    );
    return result.message_id ?? null;
  },

  /** Nome de quem escreveu, pela API de perfil (Messenger) ou do usuario (Instagram). */
  async profileName(provider: "messenger" | "instagram", userId: string, token: string) {
    if (provider === "messenger") {
      const p = await graph<{ first_name?: string; last_name?: string }>(
        `/${encodeURIComponent(userId)}?fields=first_name,last_name`,
        token,
      );
      return [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
    }
    const p = await graph<{ name?: string; username?: string }>(
      `/${encodeURIComponent(userId)}?fields=name,username`,
      token,
    );
    return p.name || p.username || null;
  },
};

const ATTACHMENT_LABEL: Record<string, string> = {
  image: "[imagem recebida]",
  audio: "[audio recebido]",
  video: "[video recebido]",
  file: "[documento recebido]",
};

const ATTACHMENT_KIND: Record<string, AttachmentKind> = {
  image: "imagem",
  audio: "audio",
  video: "video",
  file: "documento",
};

/** O arquivo vem por URL do CDN da Meta (conferida de novo no download, media.ts). */
function mediaOf(attachments: { type?: string; payload?: { url?: string } }[] = []) {
  const media: InboundMedia[] = attachments.flatMap((a) => {
    const kind = ATTACHMENT_KIND[a.type ?? ""];
    const url = a.payload?.url;
    return kind && url ? [{ kind, ref: url }] : [];
  });
  return media.length ? media : undefined;
}

interface MessagingEvent {
  sender?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
  delivery?: { mids?: string[] };
}

/**
 * So entram eventos da propria Pagina/conta da conexao (`entry.id`). Ecos (a
 * propria mensagem enviada pela Pagina) sao ignorados. Recibo de entrega vira
 * "entregue"; o de leitura nao traz ids e fica de fora.
 */
export function parseMessagingWebhook(payload: unknown, accountId: string): ParsedWebhook {
  const result: ParsedWebhook = { messages: [], statuses: [] };
  const entries = (payload as { entry?: { id?: string; messaging?: MessagingEvent[] }[] })?.entry;

  for (const entry of entries ?? []) {
    if (entry.id !== accountId) continue;
    for (const event of entry.messaging ?? []) {
      const message = event.message;
      if (message?.mid && event.sender?.id && !message.is_echo) {
        const text =
          message.text?.trim() ||
          ATTACHMENT_LABEL[message.attachments?.[0]?.type ?? ""] ||
          (message.attachments?.length ? "[anexo recebido]" : "");
        if (text) {
          result.messages.push({
            providerMessageId: message.mid,
            from: event.sender.id,
            name: null,
            text,
            media: mediaOf(message.attachments),
          });
        }
      }
      for (const mid of event.delivery?.mids ?? []) {
        result.statuses.push({ providerMessageId: mid, status: "entregue", error: null });
      }
    }
  }
  return result;
}
