import type { ChatMessage, Citation, ConfigResponse, HandoffResponse } from "./types.js";

export class ChatRagApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ChatRagApiError(
      response.status,
      (data as { error?: string }).error ?? "erro inesperado",
    );
  }
  return data as T;
}

/** Fim de um evento SSE: linha em branco. */
const SSE_EVENT_END = String.fromCharCode(10, 10);

/** So os endpoints publicos do widget (embed module). Nunca envia nem recebe
 * token administrativo (docs/apis/contratos-planejados.md - Regras). */
export function createApiClient(baseUrl: string) {
  return {
    getConfig(key: string) {
      return postJson<ConfigResponse>(baseUrl, "/widget/config", { key });
    },

    startConversation(
      key: string,
      visitor?: {
        externalUserId?: string | null;
        visitorName?: string | null;
        visitorEmail?: string | null;
        context?: Record<string, unknown> | null;
        identityToken?: string | null;
      },
    ) {
      return postJson<{
        conversationId: string;
        isResumed?: boolean;
        messages?: ChatMessage[];
      }>(baseUrl, "/widget/conversations", {
        key,
        ...(visitor?.externalUserId ? { externalUserId: visitor.externalUserId } : {}),
        ...(visitor?.visitorName ? { visitorName: visitor.visitorName } : {}),
        ...(visitor?.visitorEmail ? { visitorEmail: visitor.visitorEmail } : {}),
        ...(visitor?.context ? { context: visitor.context } : {}),
        // Token assinado pelo backend do site: so ele retoma a conversa anterior.
        ...(visitor?.identityToken ? { identityToken: visitor.identityToken } : {}),
      });
    },

    sendMessage(key: string, conversationId: string, message: string) {
      // `answer` vem null quando um atendente humano esta na conversa.
      return postJson<{ answer: string | null; citations?: Citation[]; humanHandling?: boolean }>(
        baseUrl,
        `/widget/conversations/${conversationId}/messages`,
        {
          key,
          message,
        },
      );
    },

    /**
     * Mesma mensagem, com a resposta em pedacos (Server-Sent Events). Cada
     * pedaco vai para `onDelta`; o retorno e a resposta final, que vale mais
     * que os pedacos (ex.: quando a base nao tinha a resposta).
     */
    async sendMessageStream(
      key: string,
      conversationId: string,
      message: string,
      onDelta: (text: string) => void,
    ): Promise<{ answer: string | null; citations?: Citation[]; humanHandling?: boolean }> {
      const response = await fetch(`${baseUrl}/widget/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ key, message }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ChatRagApiError(
          response.status,
          (data as { error?: string }).error ?? "erro inesperado",
        );
      }
      if (!response.body || !response.headers.get("content-type")?.includes("event-stream")) {
        return response.json();
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf(SSE_EVENT_END)) !== -1) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          if (!block.startsWith("data: ")) continue; // comentario/heartbeat
          const event = JSON.parse(block.slice(6));
          if (event.type === "delta") onDelta(event.text);
          else if (event.type === "error") throw new ChatRagApiError(500, event.error);
          else if (event.type === "done") return event;
        }
      }
      throw new ChatRagApiError(500, "resposta interrompida");
    },

    sendFeedback(key: string, conversationId: string, rating: "positivo" | "negativo") {
      return postJson<{ ok: true }>(baseUrl, `/widget/conversations/${conversationId}/feedback`, {
        key,
        rating,
      });
    },

    eventsUrl(key: string, conversationId: string) {
      return `${baseUrl}/widget/conversations/${conversationId}/events?key=${encodeURIComponent(key)}`;
    },

    requestHandoff(key: string, conversationId: string, sectorId?: string) {
      return postJson<HandoffResponse>(baseUrl, `/widget/conversations/${conversationId}/handoff`, {
        key,
        sectorId,
      });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { ChatMessage };
