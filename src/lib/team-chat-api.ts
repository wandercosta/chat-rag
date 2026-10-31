/**
 * Chat interno da equipe (docs/apis/contratos-planejados.md - Chat interno).
 * So membros da organizacao: o Master nao usa, nem com sessao de suporte.
 */
import { useEffect } from "react";
import { API_BASE_URL, apiFetch } from "./api-client";

export interface TeamThread {
  id: string;
  kind: "geral" | "direto";
  otherUserId: string | null;
  otherEmail: string | null;
  lastMessageAt: string | null;
  lastMessage: string | null;
  lastAuthorEmail: string | null;
  unread: number;
}

export interface TeamMessage {
  id: string;
  authorUserId: string | null;
  /** null: a pessoa saiu da organizacao. */
  authorEmail: string | null;
  content: string;
  createdAt: string;
}

export interface TeamPerson {
  userId: string;
  email: string;
  role: string;
}

const base = (organizationId: string) => `/organizations/${organizationId}/team-chat`;

export const teamChatApi = {
  threads: (organizationId: string) => apiFetch<TeamThread[]>(`${base(organizationId)}/threads`),
  people: (organizationId: string) => apiFetch<TeamPerson[]>(`${base(organizationId)}/people`),
  openDirect: (organizationId: string, userId: string) =>
    apiFetch<{ id: string }>(`${base(organizationId)}/direct`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  messages: (organizationId: string, threadId: string) =>
    apiFetch<TeamMessage[]>(`${base(organizationId)}/threads/${threadId}/messages`),
  send: (organizationId: string, threadId: string, content: string) =>
    apiFetch<TeamMessage>(`${base(organizationId)}/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
};

/** Nome curto para a lista: a parte do e-mail antes do @. */
export const displayName = (email: string | null) => (email ? email.split("@")[0] : "ex-membro");

/**
 * Tempo real: o servidor so avisa qual thread recebeu mensagem (e de quem);
 * quem chama recarrega as consultas. Conversa direta so chega para as duas
 * pessoas dela.
 */
export function useTeamChatEvents(
  organizationId: string | null,
  onMessage: (event: { threadId: string; authorUserId: string }) => void,
) {
  useEffect(() => {
    if (!organizationId) return;
    const source = new EventSource(`${API_BASE_URL}${base(organizationId)}/events`, {
      withCredentials: true,
    });
    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { threadId?: string; authorUserId?: string };
        if (event.threadId && event.authorUserId) {
          onMessage({ threadId: event.threadId, authorUserId: event.authorUserId });
        }
      } catch {
        // evento malformado: a proxima mensagem recarrega de qualquer jeito.
      }
    };
    return () => source.close();
  }, [organizationId, onMessage]);
}
