/**
 * Caixa de entrada (ADR-006, docs/apis/contratos-planejados.md). Separado de
 * api-client.ts, que ja passou do tamanho que o projeto aceita por arquivo.
 */
import { useEffect } from "react";
import { API_BASE_URL, apiFetch, type ConversationMessage } from "./api-client";

export type InboxStatus = "aberta" | "pendente" | "resolvida";
export type InboxView = "fila" | "minhas" | "abertas" | "resolvidas" | "assistente";

export const inboxStatusLabel: Record<InboxStatus, string> = {
  aberta: "Aberta",
  pendente: "Aguardando cliente",
  resolvida: "Resolvida",
};

export interface InboxAssignment {
  status: InboxStatus;
  assignedUserId: string | null;
  assignedUserEmail: string | null;
  sectorId: string | null;
  sectorName: string | null;
  requestedAt: string;
  updatedAt: string;
}

export interface InboxConversation {
  id: string;
  assistant_id: string;
  channel: "widget" | "whatsapp" | "playground" | "telegram" | "instagram" | "messenger";
  started_at: string;
  visitor_name: string | null;
  visitor_email: string | null;
  external_user_id: string | null;
  contact_id: string | null;
  contact_label: string | null;
  last_message: { role: ConversationMessage["role"]; content: string; created_at: string } | null;
  last_activity_at: string;
  assignment: InboxAssignment | null;
}

export interface InboxNote {
  id: string;
  content: string;
  author_email: string | null;
  created_at: string;
}

export interface InboxConversationDetail {
  id: string;
  assistant_id: string;
  channel: InboxConversation["channel"];
  started_at: string;
  contact_id: string | null;
  contact_label: string | null;
  channel_connection_id: string | null;
  /** Fim da janela de 24 horas (WhatsApp); null quando o canal nao tem janela. */
  replyWindowEndsAt: string | null;
  messages: (ConversationMessage & { author_email: string | null })[];
  assignment: InboxAssignment | null;
  notes: InboxNote[];
}

export interface InboxSector {
  id: string;
  name: string;
  memberIds: string[];
}

export interface InboxAgent {
  userId: string;
  email: string;
  role: "Administrador" | "Atendente";
}

/** Destino da transferencia: pessoa, setor ou os dois; `null` limpa. */
export interface TransferInput {
  userId?: string | null;
  sectorId?: string | null;
  reason?: string;
}

/** Aviso de transferencia que chega pelo tempo real. */
export interface TransferEvent {
  kind: "transfer";
  conversationId: string;
  byUserId: string;
  toUserId: string | null;
  toSectorId: string | null;
}

export interface CannedResponse {
  id: string;
  title: string;
  content: string;
}

const base = (organizationId: string) => `/organizations/${organizationId}`;
const postJson = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export const inboxApi = {
  list: (organizationId: string, view: InboxView, sectorId?: string) =>
    apiFetch<InboxConversation[]>(
      `${base(organizationId)}/inbox?view=${view}${sectorId ? `&sectorId=${sectorId}` : ""}`,
    ),
  transfer: (organizationId: string, conversationId: string, input: TransferInput) =>
    postJson(`${base(organizationId)}/inbox/${conversationId}/transfer`, input),
  agents: (organizationId: string) =>
    apiFetch<InboxAgent[]>(`${base(organizationId)}/inbox-agents`),
  get: (organizationId: string, conversationId: string) =>
    apiFetch<InboxConversationDetail>(`${base(organizationId)}/inbox/${conversationId}`),
  assign: (organizationId: string, conversationId: string, userId: string | null) =>
    postJson(`${base(organizationId)}/inbox/${conversationId}/assign`, { userId }),
  setStatus: (organizationId: string, conversationId: string, status: InboxStatus) =>
    postJson(`${base(organizationId)}/inbox/${conversationId}/status`, { status }),
  reply: (organizationId: string, conversationId: string, content: string) =>
    postJson(`${base(organizationId)}/inbox/${conversationId}/messages`, { content }),
  addNote: (organizationId: string, conversationId: string, content: string) =>
    postJson(`${base(organizationId)}/inbox/${conversationId}/notes`, { content }),
};

export const sectorsApi = {
  list: (organizationId: string) =>
    apiFetch<InboxSector[]>(`${base(organizationId)}/inbox-sectors`),
  create: (organizationId: string, name: string) =>
    postJson<InboxSector>(`${base(organizationId)}/inbox-sectors`, { name }),
  update: (organizationId: string, id: string, input: { name?: string; memberIds?: string[] }) =>
    apiFetch<InboxSector>(`${base(organizationId)}/inbox-sectors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (organizationId: string, id: string) =>
    apiFetch<void>(`${base(organizationId)}/inbox-sectors/${id}`, { method: "DELETE" }),
};

export const cannedResponsesApi = {
  list: (organizationId: string) =>
    apiFetch<CannedResponse[]>(`${base(organizationId)}/canned-responses`),
  create: (organizationId: string, input: { title: string; content: string }) =>
    postJson<CannedResponse>(`${base(organizationId)}/canned-responses`, input),
  remove: (organizationId: string, id: string) =>
    apiFetch<void>(`${base(organizationId)}/canned-responses/${id}`, { method: "DELETE" }),
};

/**
 * Tempo real: o servidor so avisa qual conversa mudou; quem chama recarrega
 * as consultas. `withCredentials` leva o cookie de sessao, como as outras
 * chamadas do painel. O EventSource reconecta sozinho se a conexao cair.
 */
export function useInboxEvents(
  organizationId: string | null,
  onChange: (conversationId: string) => void,
  onTransfer?: (event: TransferEvent) => void,
) {
  useEffect(() => {
    if (!organizationId) return;
    const source = new EventSource(`${API_BASE_URL}${base(organizationId)}/inbox/events`, {
      withCredentials: true,
    });
    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { kind?: string; conversationId?: string };
        if (event.conversationId) onChange(event.conversationId);
        if (event.kind === "transfer") onTransfer?.(event as TransferEvent);
      } catch {
        // evento malformado: a proxima mudanca recarrega de qualquer jeito.
      }
    };
    return () => source.close();
  }, [organizationId, onChange, onTransfer]);
}
