import { auditService } from "../audit/index.js";
import { contactsService } from "../contacts/index.js";
import { dealsService } from "../deals/index.js";
import { membersService } from "../identity/index.js";
import { tasksRepository, type TaskFilter, type TaskRow } from "./tasks.repository.js";

export class TaskNotFoundError extends Error {}
/** Contato, negocio ou responsavel que nao e desta organizacao (422). */
export class TaskInvalidReferenceError extends Error {}
/** Atendente so exclui tarefa que criou (403). */
export class TaskForbiddenError extends Error {}

export interface TaskInput {
  title?: string;
  notes?: string | null;
  dueAt?: Date | null;
  assigneeUserId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
}

async function assertRefs(organizationId: string, input: TaskInput) {
  if (input.contactId) {
    const labels = await contactsService.labelsFor(organizationId, [input.contactId]);
    if (!labels.has(input.contactId)) throw new TaskInvalidReferenceError("contato");
  }
  if (input.dealId) {
    const titles = await dealsService.titlesFor(organizationId, [input.dealId]);
    if (!titles.has(input.dealId)) throw new TaskInvalidReferenceError("negocio");
  }
  if (input.assigneeUserId) {
    const role = await membersService.roleOf(organizationId, input.assigneeUserId);
    if (role !== "Administrador" && role !== "Atendente") {
      throw new TaskInvalidReferenceError("responsavel");
    }
  }
}

function toValues(input: TaskInput) {
  return {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.dueAt !== undefined && { due_at: input.dueAt }),
    ...(input.assigneeUserId !== undefined && { assignee_user_id: input.assigneeUserId }),
    ...(input.contactId !== undefined && { contact_id: input.contactId }),
    ...(input.dealId !== undefined && { deal_id: input.dealId }),
  };
}

/** Nome do contato, titulo do negocio e e-mails pelas interfaces publicas (ADR-002). */
async function present(organizationId: string, rows: TaskRow[]) {
  const [labels, titles, members] = await Promise.all([
    contactsService.labelsFor(
      organizationId,
      rows.flatMap((r) => (r.contact_id ? [r.contact_id] : [])),
    ),
    dealsService.titlesFor(
      organizationId,
      rows.flatMap((r) => (r.deal_id ? [r.deal_id] : [])),
    ),
    membersService.list(organizationId),
  ]);
  const emails = new Map(members.map((m) => [m.user_id, m.email]));
  const email = (id: string | null) => (id ? (emails.get(id) ?? null) : null);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    dueAt: r.due_at,
    overdue: !r.done_at && !!r.due_at && r.due_at.getTime() < Date.now(),
    assigneeUserId: r.assignee_user_id,
    assigneeEmail: email(r.assignee_user_id),
    contactId: r.contact_id,
    contactLabel: r.contact_id ? (labels.get(r.contact_id) ?? null) : null,
    dealId: r.deal_id,
    dealTitle: r.deal_id ? (titles.get(r.deal_id) ?? null) : null,
    createdBy: r.created_by,
    doneAt: r.done_at,
    doneByEmail: email(r.done_by),
    createdAt: r.created_at,
  }));
}

/** Tarefas com lembrete (ADR-008 #4). */
export const tasksService = {
  async list(organizationId: string, filter: TaskFilter) {
    return present(organizationId, await tasksRepository.list(organizationId, filter));
  },

  async get(organizationId: string, taskId: string) {
    const row = await tasksRepository.findById(organizationId, taskId);
    if (!row) throw new TaskNotFoundError();
    return (await present(organizationId, [row]))[0];
  },

  async create(actorUserId: string, organizationId: string, input: TaskInput & { title: string }) {
    await assertRefs(organizationId, input);
    const { id } = await tasksRepository.insert(organizationId, {
      ...toValues(input),
      title: input.title,
      created_by: actorUserId,
    });
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou tarefa",
      type: "conteudo",
      target: id,
    });
    return this.get(organizationId, id);
  },

  /** `done` conclui ou reabre; prazo novo volta a avisar. */
  async update(
    actorUserId: string,
    organizationId: string,
    taskId: string,
    input: TaskInput & { done?: boolean },
  ) {
    const current = await tasksRepository.findById(organizationId, taskId);
    if (!current) throw new TaskNotFoundError();
    await assertRefs(organizationId, input);
    await tasksRepository.update(organizationId, taskId, {
      ...toValues(input),
      ...(input.dueAt !== undefined && { reminded_at: null }),
      ...(input.done === true && !current.done_at && { done_at: new Date(), done_by: actorUserId }),
      ...(input.done === false && { done_at: null, done_by: null }),
    });
    if (input.done !== undefined && input.done !== !!current.done_at) {
      await auditService.record({
        actorUserId,
        organizationId,
        action: input.done ? "Concluiu tarefa" : "Reabriu tarefa",
        type: "conteudo",
        target: taskId,
      });
    }
    return this.get(organizationId, taskId);
  },

  async remove(actorUserId: string, organizationId: string, taskId: string, isAdmin: boolean) {
    const current = await tasksRepository.findById(organizationId, taskId);
    if (!current) throw new TaskNotFoundError();
    if (!isAdmin && current.created_by !== actorUserId) throw new TaskForbiddenError();
    await tasksRepository.delete(organizationId, taskId);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Excluiu tarefa",
      type: "conteudo",
      target: taskId,
    });
  },

  async exportAll(organizationId: string) {
    return present(organizationId, await tasksRepository.exportAll(organizationId));
  },
};
