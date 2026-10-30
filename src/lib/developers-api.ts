/** API publica, webhooks e metricas por atendente (etapa 8; docs/apis/contratos-planejados.md). */
import { apiFetch } from "./api-client";

export const API_SCOPES = [
  { id: "contacts:read", label: "Ler contatos" },
  { id: "contacts:write", label: "Criar contatos" },
  { id: "conversations:read", label: "Ler conversas" },
] as const;
export type ApiScope = (typeof API_SCOPES)[number]["id"];

export const WEBHOOK_EVENTS = [
  { id: "mensagem.recebida", label: "Mensagem recebida" },
  { id: "conversa.resolvida", label: "Conversa resolvida" },
  { id: "contato.criado", label: "Contato criado" },
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["id"];

export interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: ApiScope[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  status: "pendente" | "entregue" | "falhou";
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
}

export interface AgentMetrics {
  userId: string;
  email: string;
  assigned: number;
  resolved: number;
  messagesSent: number;
  firstResponseMedianSeconds: number | null;
  firstResponseAverageSeconds: number | null;
}

export interface MetricsReport {
  days: number;
  team: {
    requests: number;
    waiting: number;
    resolved: number;
    firstResponseMedianSeconds: number | null;
  };
  agents: AgentMetrics[];
}

const org = (organizationId: string) => `/organizations/${organizationId}`;
const send = <T>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const developersApi = {
  tokens: (organizationId: string) => apiFetch<ApiToken[]>(`${org(organizationId)}/api-tokens`),
  createToken: (organizationId: string, name: string, scopes: ApiScope[]) =>
    send<ApiToken & { token: string }>("POST", `${org(organizationId)}/api-tokens`, {
      name,
      scopes,
    }),
  revokeToken: (organizationId: string, id: string) =>
    send<void>("DELETE", `${org(organizationId)}/api-tokens/${id}`),

  webhooks: (organizationId: string) => apiFetch<Webhook[]>(`${org(organizationId)}/webhooks`),
  createWebhook: (organizationId: string, url: string, events: WebhookEvent[]) =>
    send<Webhook & { secret: string }>("POST", `${org(organizationId)}/webhooks`, { url, events }),
  setWebhookEnabled: (organizationId: string, id: string, enabled: boolean) =>
    send<Webhook>("PATCH", `${org(organizationId)}/webhooks/${id}`, { enabled }),
  rotateSecret: (organizationId: string, id: string) =>
    send<{ secret: string }>("POST", `${org(organizationId)}/webhooks/${id}/rotate-secret`),
  testWebhook: (organizationId: string, id: string) =>
    send<{ id: string }>("POST", `${org(organizationId)}/webhooks/${id}/test`),
  deliveries: (organizationId: string, id: string) =>
    apiFetch<WebhookDelivery[]>(`${org(organizationId)}/webhooks/${id}/deliveries`),
  removeWebhook: (organizationId: string, id: string) =>
    send<void>("DELETE", `${org(organizationId)}/webhooks/${id}`),

  metrics: (organizationId: string, days: number) =>
    apiFetch<MetricsReport>(`${org(organizationId)}/agent-metrics?days=${days}`),
};

/** "3 min", "1 h 20 min", "45 s". */
export function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}
