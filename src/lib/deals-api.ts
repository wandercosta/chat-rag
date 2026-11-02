/** Funil de vendas (ADR-008; docs/apis/contratos-planejados.md - Funil de vendas). */
import { apiFetch } from "./api-client";

export type StageKind = "aberta" | "ganho" | "perdido";
export type DealStatus = "aberto" | "ganho" | "perdido";

export interface PipelineStage {
  id: string;
  name: string;
  kind: StageKind;
  position: number;
}

export interface Pipeline {
  id: string;
  name: string;
  position: number;
  stages: PipelineStage[];
}

export interface Deal {
  id: string;
  pipelineId: string;
  stageId: string;
  position: number;
  title: string;
  valueCents: number | null;
  contactId: string | null;
  contactLabel: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  /** AAAA-MM-DD. */
  expectedCloseDate: string | null;
  status: DealStatus;
  lostReason: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealDetail extends Deal {
  history: {
    fromStageId: string | null;
    toStageId: string | null;
    changedByEmail: string | null;
    changedAt: string;
  }[];
}

export interface DealInput {
  title?: string;
  valueCents?: number | null;
  contactId?: string | null;
  ownerUserId?: string | null;
  expectedCloseDate?: string | null;
}

const org = (organizationId: string) => `/organizations/${organizationId}`;
const send = <T>(path: string, method: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const dealsApi = {
  pipelines: (organizationId: string) => apiFetch<Pipeline[]>(`${org(organizationId)}/pipelines`),
  list: (organizationId: string, filter: { pipelineId?: string; contactId?: string }) => {
    const query = new URLSearchParams(
      Object.entries(filter).filter((e): e is [string, string] => !!e[1]),
    );
    return apiFetch<Deal[]>(`${org(organizationId)}/deals?${query}`);
  },
  get: (organizationId: string, dealId: string) =>
    apiFetch<DealDetail>(`${org(organizationId)}/deals/${dealId}`),
  create: (
    organizationId: string,
    input: DealInput & { title: string; pipelineId: string; stageId?: string },
  ) => send<DealDetail>(`${org(organizationId)}/deals`, "POST", input),
  update: (organizationId: string, dealId: string, input: DealInput) =>
    send<DealDetail>(`${org(organizationId)}/deals/${dealId}`, "PATCH", input),
  move: (
    organizationId: string,
    dealId: string,
    input: { stageId: string; position?: number; lostReason?: string | null },
  ) => send<DealDetail>(`${org(organizationId)}/deals/${dealId}/move`, "POST", input),
  remove: (organizationId: string, dealId: string) =>
    send<void>(`${org(organizationId)}/deals/${dealId}`, "DELETE"),

  createPipeline: (organizationId: string, name: string) =>
    send<Pipeline>(`${org(organizationId)}/pipelines`, "POST", { name }),
  renamePipeline: (organizationId: string, pipelineId: string, name: string) =>
    send<void>(`${org(organizationId)}/pipelines/${pipelineId}`, "PATCH", { name }),
  removePipeline: (organizationId: string, pipelineId: string) =>
    send<void>(`${org(organizationId)}/pipelines/${pipelineId}`, "DELETE"),
  addStage: (organizationId: string, pipelineId: string, name: string, kind: StageKind) =>
    send<PipelineStage>(`${org(organizationId)}/pipelines/${pipelineId}/stages`, "POST", {
      name,
      kind,
    }),
  reorderStages: (organizationId: string, pipelineId: string, stageIds: string[]) =>
    send<void>(`${org(organizationId)}/pipelines/${pipelineId}/stage-order`, "PUT", { stageIds }),
  renameStage: (organizationId: string, stageId: string, name: string) =>
    send<void>(`${org(organizationId)}/pipeline-stages/${stageId}`, "PATCH", { name }),
  removeStage: (organizationId: string, stageId: string) =>
    send<void>(`${org(organizationId)}/pipeline-stages/${stageId}`, "DELETE"),
};

export const stageKindLabel: Record<StageKind, string> = {
  aberta: "Em andamento",
  ganho: "Ganho",
  perdido: "Perdido",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatCents = (cents: number | null) =>
  cents === null ? "" : brl.format(cents / 100);

/**
 * Valor digitado em centavos, no jeito brasileiro: "1.500" e mil e
 * quinhentos, "1.500,50" tem centavos; "1500.5" (ponto com 1 ou 2 casas)
 * tambem vale. Vazio vira null; o que nao da para entender vira undefined,
 * para o formulario recusar em vez de apagar o valor.
 */
export function parseMoney(text: string): number | null | undefined {
  const clean = text.replace(/[R$\s]/g, "");
  if (!clean) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(clean) || /^\d+(,\d{1,2})?$/.test(clean)) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(clean)) {
    normalized = clean;
  } else {
    return undefined;
  }
  return Math.round(Number(normalized) * 100);
}

export const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "";
