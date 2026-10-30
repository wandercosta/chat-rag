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

  async sendText(pageId: string, token: string, recipientId: string, text: string) {
    const result = await graph<{ message_id?: string }>(
      `/${encodeURIComponent(pageId)}/messages`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { text },
        }),
      },
    );
    return result.message_id ?? null;
  },
};

const ATTACHMENT_LABEL: Record<string, string> = {
  image: "[imagem recebida]",
  audio: "[audio recebido]",
  video: "[video recebido]",
  file: "[documento recebido]",
};

interface MessagingEvent {
  sender?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type?: string }[];
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
