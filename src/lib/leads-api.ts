/** Classificacao de leads com IA (ADR-009; docs/apis/contratos-planejados.md). */
import { apiFetch } from "./api-client";

export type LeadTemperature = "quente" | "morno" | "frio";
export type LeadConfidence = "baixa" | "media" | "alta";

export interface LeadInsight {
  id: string;
  contactId: string;
  temperature: LeadTemperature;
  confidence: LeadConfidence;
  interest: string;
  nextStep: string;
  summary: string;
  model: string | null;
  status: "sugerida" | "aceita" | "descartada";
  createdByEmail: string | null;
  createdAt: string;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
}

const org = (organizationId: string) => `/organizations/${organizationId}`;

export const leadsApi = {
  settings: (organizationId: string) =>
    apiFetch<{ enabled: boolean }>(`${org(organizationId)}/lead-settings`),
  setEnabled: (organizationId: string, enabled: boolean) =>
    apiFetch<{ enabled: boolean }>(`${org(organizationId)}/lead-settings`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
  forContact: (organizationId: string, contactId: string) =>
    apiFetch<{ current: LeadInsight | null; pending: LeadInsight | null; history: LeadInsight[] }>(
      `${org(organizationId)}/contacts/${contactId}/lead-insights`,
    ),
  classify: (organizationId: string, contactId: string) =>
    apiFetch<LeadInsight>(`${org(organizationId)}/contacts/${contactId}/lead-insights`, {
      method: "POST",
    }),
  review: (organizationId: string, insightId: string, accepted: boolean) =>
    apiFetch<LeadInsight>(`${org(organizationId)}/lead-insights/${insightId}/review`, {
      method: "POST",
      body: JSON.stringify({ accepted }),
    }),
  current: (organizationId: string, contactIds: string[]) =>
    apiFetch<Record<string, { temperature: LeadTemperature; confidence: LeadConfidence }>>(
      `${org(organizationId)}/lead-insights/current?contactIds=${contactIds.join(",")}`,
    ),
};

export const temperatureLabel: Record<LeadTemperature, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
};

/** Cor do selo: quente chama atencao, frio fica neutro. */
export const temperatureClass: Record<LeadTemperature, string> = {
  quente: "border-transparent bg-destructive/15 text-destructive",
  morno: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  frio: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400",
};

export const confidenceLabel: Record<LeadConfidence, string> = {
  baixa: "confiança baixa",
  media: "confiança média",
  alta: "confiança alta",
};
