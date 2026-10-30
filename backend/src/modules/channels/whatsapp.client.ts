import { env } from "../../config/env.js";

/** Erro da Graph API, com a mensagem que a Meta devolveu (sem o token). */
export class WhatsAppApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }

  /** 5xx e limite de taxa valem nova tentativa; o resto e erro de dado. */
  get retryable() {
    return this.status >= 500 || this.status === 429;
  }
}

async function graph<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${env.WHATSAPP_GRAPH_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new WhatsAppApiError(503, "nao foi possivel falar com a API do WhatsApp");
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & T;
  if (!response.ok) {
    throw new WhatsAppApiError(response.status, body.error?.message ?? `erro ${response.status}`);
  }
  return body;
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
