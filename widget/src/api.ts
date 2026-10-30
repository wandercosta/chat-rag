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
