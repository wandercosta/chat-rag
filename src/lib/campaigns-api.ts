/** Campanhas (ADR-006 #9, etapa 6; docs/apis/contratos-planejados.md). */
import { apiFetch } from "./api-client";

export type CampaignStatus = "rascunho" | "agendada" | "enviando" | "concluida" | "cancelada";

export interface Campaign {
  id: string;
  name: string;
  connection_id: string | null;
  segment_id: string | null;
  template_id: string | null;
  template_params: string[];
  text: string | null;
  status: CampaignStatus;
  rate_per_minute: number;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface CampaignDetail extends Campaign {
  stats: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    skipped: number;
    delivered: number;
    read: number;
    replied: number;
  };
  recipients: {
    id: string;
    contact_id: string;
    label: string;
    status: "pendente" | "enviada" | "falhou" | "ignorada";
    error: string | null;
    sent_at: string | null;
    delivery_status: string | null;
  }[];
}

export interface NewCampaign {
  name: string;
  connectionId: string;
  segmentId: string;
  templateId?: string | null;
  templateParams?: string[];
  text?: string | null;
  ratePerMinute?: number;
}

export const campaignStatusLabel: Record<CampaignStatus, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  enviando: "Enviando",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const base = (organizationId: string) => `/organizations/${organizationId}/campaigns`;
const post = <T>(path: string, body: unknown = {}) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export const campaignsApi = {
  list: (organizationId: string) => apiFetch<Campaign[]>(base(organizationId)),
  get: (organizationId: string, id: string) =>
    apiFetch<CampaignDetail>(`${base(organizationId)}/${id}`),
  preview: (organizationId: string, connectionId: string, segmentId: string) =>
    post<{ eligible: number; withoutConsent: number; withoutAddress: number }>(
      `${base(organizationId)}/preview`,
      { connectionId, segmentId },
    ),
  create: (organizationId: string, input: NewCampaign) =>
    post<Campaign>(base(organizationId), input),
  schedule: (organizationId: string, id: string, at?: string) =>
    post<CampaignDetail>(`${base(organizationId)}/${id}/schedule`, at ? { at } : {}),
  cancel: (organizationId: string, id: string) =>
    post<CampaignDetail>(`${base(organizationId)}/${id}/cancel`),
};
