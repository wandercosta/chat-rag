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
  inputTokens: number;
  outputTokens: number;
  /** Tokens x preco do modelo no catalogo (US$); 0 sem preco. */
  estimatedCostUsd: number;
  /** Parte da chave da plataforma (o resto e da chave do proprio tenant). */
  platformCostUsd: number;
}

export interface PlatformUsage {
  days: number;
  totals: Omit<TenantUsage, "organizationId"> & {
    activeOrganizations: number;
    avgRagLatencyMs: number | null;
  };
  /** Modelos que responderam sem preco no catalogo: ficam fora do custo. */
  unpricedModels: string[];
  conversationsByChannel: Record<string, number>;
  messagesReceivedPerDay: { day: string; count: number }[];
  organizations: TenantUsage[];
}

export const platformUsageApi = {
  get: (days: number) => apiFetch<PlatformUsage>(`/master/usage?days=${days}`),
};
