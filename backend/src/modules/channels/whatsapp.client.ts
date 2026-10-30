import { env } from "../../config/env.js";
import { requestJson } from "./http.js";

/** Chamada a Graph API da Meta com o token do tenant (WhatsApp, Messenger e Instagram). */
export function graph<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  return requestJson<T>(
    `${env.META_GRAPH_URL}${path}`,
    { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } },
    (body) => (body as { error?: { message?: string } }).error?.message,
  );
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: { type: string; text?: string }[];
}

/** WhatsApp Cloud API oficial (ADR-006 #6). Cada chamada usa o token do tenant. */
export const whatsappClient = {
  phoneNumberInfo(phoneNumberId: string, token: string) {
    return graph<{ display_phone_number?: string; verified_name?: string }>(
      `/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
      token,
    );
  },

  /** Midia recebida: a Graph devolve uma URL curta, baixada com o mesmo token. */
  mediaInfo(mediaId: string, token: string) {
    return graph<{ url?: string; mime_type?: string }>(`/${encodeURIComponent(mediaId)}`, token);
  },

  async sendText(phoneNumberId: string, token: string, to: string, body: string) {
    const result = await graph<{ messages?: { id: string }[] }>(
      `/${encodeURIComponent(phoneNumberId)}/messages`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body, preview_url: false },
        }),
      },
    );
    return result.messages?.[0]?.id ?? null;
  },

  /** Fora da janela de 24 horas, so modelo aprovado (ADR-006 #9). */
  async sendTemplate(
    phoneNumberId: string,
    token: string,
    to: string,
    template: { name: string; language: string; params: string[] },
  ) {
    const result = await graph<{ messages?: { id: string }[] }>(
      `/${encodeURIComponent(phoneNumberId)}/messages`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: template.name,
            language: { code: template.language },
            components: template.params.length
              ? [
                  {
                    type: "body",
                    parameters: template.params.map((text) => ({ type: "text", text })),
                  },
                ]
              : [],
          },
        }),
      },
    );
    return result.messages?.[0]?.id ?? null;
  },

  async listTemplates(wabaId: string, token: string) {
    const result = await graph<{ data?: WhatsAppTemplate[] }>(
      `/${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,category,components&limit=200`,
      token,
    );
    return result.data ?? [];
  },
};
