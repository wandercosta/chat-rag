/** Canais oficiais (ADR-006, etapa 4; docs/apis/contratos-planejados.md). */
import { apiFetch } from "./api-client";

export type ChannelProvider = "whatsapp" | "telegram" | "instagram" | "messenger";

export interface ChannelConnection {
  id: string;
  assistant_id: string;
  provider: ChannelProvider;
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

const base = (organizationId: string) => `/organizations/${organizationId}`;
const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const channelsApi = {
  list: (organizationId: string) =>
    apiFetch<ChannelConnection[]>(`${base(organizationId)}/channels`),
  /** Os campos de cada provedor estao no dialogo de conexao. */
  connect: (organizationId: string, provider: ChannelProvider, input: Record<string, string>) =>
    post<ChannelConnection>(`${base(organizationId)}/channels/${provider}`, input),
  /** Tag "Agente humano" da Meta (Messenger e Instagram): responder ate 7 dias. */
  setHumanAgentTag: (organizationId: string, id: string, humanAgentTag: boolean) =>
    apiFetch<{ config: Record<string, string> }>(`${base(organizationId)}/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ humanAgentTag }),
    }),
  /** Cadastro integrado da Meta: `config` null quando a plataforma nao tem o app. */
  embeddedSignupConfig: (organizationId: string) =>
    apiFetch<{ config: { appId: string; configId: string } | null }>(
      `${base(organizationId)}/channels/embedded-signup`,
    ),
  connectEmbedded: (
    organizationId: string,
    input: {
      name: string;
      assistantId: string;
      code: string;
      phoneNumberId: string;
      wabaId: string;
    },
  ) => post<ChannelConnection>(`${base(organizationId)}/channels/whatsapp/embedded`, input),
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
