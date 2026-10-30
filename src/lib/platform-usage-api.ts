/** Consumo agregado da plataforma, so para o Master (docs/apis/contratos-planejados.md). */
import { apiFetch } from "./api-client";

export interface TenantUsage {
  organizationId: string;
  conversations: number;
  messagesReceived: number;
  assistantReplies: number;
  agentReplies: number;
  ragQueries: number;
  noContext: number;
}

export interface PlatformUsage {
  days: number;
  totals: Omit<TenantUsage, "organizationId"> & {
    activeOrganizations: number;
    avgRagLatencyMs: number | null;
  };
  conversationsByChannel: Record<string, number>;
  messagesReceivedPerDay: { day: string; count: number }[];
  organizations: TenantUsage[];
}

export const platformUsageApi = {
  get: (days: number) => apiFetch<PlatformUsage>(`/master/usage?days=${days}`),
};
