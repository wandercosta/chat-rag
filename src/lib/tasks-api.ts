/** Tarefas com lembrete (ADR-008 #4; docs/apis/contratos-planejados.md - Tarefas). */
import { useEffect } from "react";
import { API_BASE_URL, apiFetch } from "./api-client";

export type TaskStatus = "abertas" | "atrasadas" | "concluidas";

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  overdue: boolean;
  assigneeUserId: string | null;
  assigneeEmail: string | null;
  contactId: string | null;
  contactLabel: string | null;
  dealId: string | null;
  dealTitle: string | null;
  createdBy: string | null;
  doneAt: string | null;
  doneByEmail: string | null;
  createdAt: string;
}

export interface TaskInput {
  title?: string;
  notes?: string | null;
  dueAt?: string | null;
  assigneeUserId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
}

const base = (organizationId: string) => `/organizations/${organizationId}/tasks`;

export const tasksApi = {
  list: (
    organizationId: string,
    query: { view?: "minhas" | "todas"; status?: TaskStatus; contactId?: string; dealId?: string },
  ) => {
    const params = new URLSearchParams(
      Object.entries(query).filter((e): e is [string, string] => !!e[1]),
    );
    return apiFetch<Task[]>(`${base(organizationId)}?${params}`);
  },
  create: (organizationId: string, input: TaskInput & { title: string }) =>
    apiFetch<Task>(base(organizationId), { method: "POST", body: JSON.stringify(input) }),
  update: (organizationId: string, taskId: string, input: TaskInput & { done?: boolean }) =>
    apiFetch<Task>(`${base(organizationId)}/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (organizationId: string, taskId: string) =>
    apiFetch<void>(`${base(organizationId)}/${taskId}`, { method: "DELETE" }),
};

export const formatDue = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "sem prazo";

/** "AAAA-MM-DDTHH:MM" do input datetime-local, no fuso do navegador. */
export function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Aviso de tarefa vencida do proprio usuario (tempo real, so ids). */
export function useTaskReminders(organizationId: string | null, onDue: (taskId: string) => void) {
  useEffect(() => {
    if (!organizationId) return;
    const source = new EventSource(`${API_BASE_URL}${base(organizationId)}/events`, {
      withCredentials: true,
    });
    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { kind?: string; taskId?: string };
        if (event.kind === "task_due" && event.taskId) onDue(event.taskId);
      } catch {
        // evento malformado: a lista de tarefas mostra o atraso de qualquer jeito.
      }
    };
    return () => source.close();
  }, [organizationId, onDue]);
}
