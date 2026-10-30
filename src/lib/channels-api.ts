/** Canais oficiais (ADR-006, etapa 4; docs/apis/contratos-planejados.md). */
import { apiFetch } from "./api-client";

export interface ChannelConnection {
  id: string;
  assistant_id: string;
  provider: "whatsapp" | "telegram" | "instagram" | "messenger";
  name: string;
  external_id: string;
  config: Record<string, string>;
  /** So o final do token; o valor nunca volta da API. */
  secret_hint: string;
  verify_token: string;
  status: "ativo" | "erro" | "inativo";
  status_detail: string | null;
  webhookUrl: string;
  created_at: string;
}

export interface ChannelTemplate {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  body: string;
  variables: number;
}

export interface NewWhatsAppConnection {
  name: string;
  assistantId: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  appSecret: string;
}

const base = (organizationId: string) => `/organizations/${organizationId}`;
const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const channelsApi = {
  list: (organizationId: string) =>
    apiFetch<ChannelConnection[]>(`${base(organizationId)}/channels`),
  createWhatsApp: (organizationId: string, input: NewWhatsAppConnection) =>
    post<ChannelConnection>(`${base(organizationId)}/channels/whatsapp`, input),
  check: (organizationId: string, id: string) =>
    post<{ status: string; detail: string | null }>(`${base(organizationId)}/channels/${id}/check`),
  remove: (organizationId: string, id: string) =>
    apiFetch<void>(`${base(organizationId)}/channels/${id}`, { method: "DELETE" }),
  templates: (organizationId: string, id: string) =>
    apiFetch<ChannelTemplate[]>(`${base(organizationId)}/channels/${id}/templates`),
  syncTemplates: (organizationId: string, id: string) =>
    post<ChannelTemplate[]>(`${base(organizationId)}/channels/${id}/templates/sync`),
  sendTemplate: (
    organizationId: string,
    conversationId: string,
    templateId: string,
    params: string[],
  ) => post(`${base(organizationId)}/inbox/${conversationId}/template`, { templateId, params }),
};

export const channelLabel: Record<string, string> = {
  widget: "Widget",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  messenger: "Messenger",
  playground: "Playground",
};

export const deliveryLabel: Record<string, string> = {
  enviando: "enviando…",
  enviada: "enviada ✓",
  entregue: "entregue ✓✓",
  lida: "lida ✓✓",
  falhou: "não entregue",
};
