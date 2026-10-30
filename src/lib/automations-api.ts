/** Automacoes (ADR-006 #4, etapa 7; docs/apis/contratos-planejados.md). */
import { apiFetch } from "./api-client";

export type Trigger = "mensagem_recebida" | "sem_resposta";
export type ChannelName = "widget" | "whatsapp" | "telegram" | "instagram" | "messenger";

export type Condition =
  | { type: "canal"; channels: ChannelName[] }
  | { type: "texto_contem"; keywords: string[] }
  | { type: "contato_tem_etiqueta"; tagId: string }
  | { type: "primeira_mensagem" }
  | { type: "fora_do_horario"; start: string; end: string; weekdays: number[] }
  | { type: "sem_resposta_ha"; minutes: number };

export type Action =
  | { type: "responder"; text: string }
  | { type: "adicionar_etiqueta"; tagId: string }
  | { type: "encaminhar_humano" }
  | { type: "atribuir"; userId: string }
  | { type: "nota_interna"; text: string }
  | { type: "devolver_fila" };

export interface RuleInput {
  name: string;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
}

export interface Rule extends RuleInput {
  id: string;
  enabled: boolean;
  version: number;
  updated_at: string;
}

export interface RuleRun {
  id: string;
  rule_version: number;
  conversation_id: string | null;
  status: "ok" | "erro";
  detail: string;
  created_at: string;
}

export const triggerLabel: Record<Trigger, string> = {
  mensagem_recebida: "Quando chegar mensagem (antes do assistente)",
  sem_resposta: "Quando o cliente ficar sem resposta de quem atende",
};

/** O que cada gatilho aceita; espelha a validacao do backend (rules.ts). */
export const allowedFor: Record<
  Trigger,
  { conditions: Condition["type"][]; actions: Action["type"][] }
> = {
  mensagem_recebida: {
    conditions: [
      "canal",
      "texto_contem",
      "contato_tem_etiqueta",
      "primeira_mensagem",
      "fora_do_horario",
    ],
    actions: ["responder", "adicionar_etiqueta", "encaminhar_humano", "atribuir", "nota_interna"],
  },
  sem_resposta: {
    conditions: ["sem_resposta_ha", "canal", "contato_tem_etiqueta"],
    actions: ["devolver_fila", "atribuir", "nota_interna", "adicionar_etiqueta"],
  },
};

export const conditionLabel: Record<Condition["type"], string> = {
  canal: "Canal é",
  texto_contem: "Mensagem contém",
  contato_tem_etiqueta: "Contato tem a etiqueta",
  primeira_mensagem: "É a primeira mensagem da conversa",
  fora_do_horario: "Fora do horário de atendimento",
  sem_resposta_ha: "Sem resposta há (minutos)",
};

export const actionLabel: Record<Action["type"], string> = {
  responder: "Responder com",
  adicionar_etiqueta: "Adicionar etiqueta",
  encaminhar_humano: "Passar para a fila de atendimento",
  atribuir: "Atribuir a",
  nota_interna: "Escrever nota interna",
  devolver_fila: "Devolver para a fila",
};

const base = (organizationId: string) => `/organizations/${organizationId}/automations`;
const send = <T>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const automationsApi = {
  list: (organizationId: string) => apiFetch<Rule[]>(base(organizationId)),
  create: (organizationId: string, input: RuleInput) =>
    send<Rule>("POST", base(organizationId), input),
  update: (organizationId: string, id: string, input: RuleInput) =>
    send<Rule>("PUT", `${base(organizationId)}/${id}`, input),
  setEnabled: (organizationId: string, id: string, enabled: boolean) =>
    send<Rule>("POST", `${base(organizationId)}/${id}/enabled`, { enabled }),
  remove: (organizationId: string, id: string) =>
    send<void>("DELETE", `${base(organizationId)}/${id}`),
  runs: (organizationId: string, id: string) =>
    apiFetch<RuleRun[]>(`${base(organizationId)}/${id}/runs`),
};
