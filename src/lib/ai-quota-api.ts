/** Teto mensal da IA da plataforma por tenant (ADR-007). */
import { apiFetch } from "./api-client";

export type AiLimitMode = "padrao" | "personalizado" | "sem_limite";

export interface AiQuota {
  mode: AiLimitMode;
  customTokens: number | null;
  /** PLATFORM_AI_MONTHLY_TOKENS do .env (null = sem limite). */
  platformDefault: number | null;
  /** Teto efetivo do mes; null = sem limite. */
  limit: number | null;
  used: number;
  exceeded: boolean;
  periodStart: string;
  resetsAt: string;
}

export const aiQuotaApi = {
  get: (organizationId: string) => apiFetch<AiQuota>(`/organizations/${organizationId}/ai-quota`),
  getAsMaster: (organizationId: string) =>
    apiFetch<AiQuota>(`/master/tenants/${organizationId}/ai-quota`),
  setLimit: (organizationId: string, mode: AiLimitMode, tokens: number | null) =>
    apiFetch<AiQuota>(`/master/tenants/${organizationId}/ai-limit`, {
      method: "PUT",
      body: JSON.stringify({ mode, tokens }),
    }),
};

export const formatTokens = (n: number) => n.toLocaleString("pt-BR");

/** Dia em que o teto volta (resetsAt e o primeiro instante do mes seguinte, UTC). */
export const resetDay = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
