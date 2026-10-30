import { auditService } from "../audit/index.js";
import { conversationsService } from "../conversations/index.js";
import { membersService } from "../identity/index.js";
import { realtime, type InboxEvent } from "../../realtime/events.js";
import type { InboxStatus, TenantRole } from "../../db/types.js";
import { assignmentsRepository, type AssignmentView } from "./assignments.repository.js";
import { notesRepository } from "./notes.repository.js";

export class ConversationNotFoundError extends Error {}
/** Hoje so o widget recebe resposta humana; playground e teste interno. */
export class ChannelNotSupportedError extends Error {}
/** Evita duas pessoas respondendo a mesma conversa ao mesmo tempo. */
export class AssignedToAnotherUserError extends Error {}
export class InvalidAssigneeError extends Error {}
export class ForbiddenAssignmentError extends Error {}

export type InboxView = AssignmentView | "assistente";

export interface InboxActor {
  userId: string;
  role: TenantRole;
}

/** Quem pode receber e responder conversas. */
const AGENT_ROLES: readonly TenantRole[] = ["Administrador", "Atendente"];

type AssignmentRow = NonNullable<Awaited<ReturnType<typeof assignmentsRepository.find>>>;

function isActive(row: AssignmentRow | undefined): row is AssignmentRow {
  return !!row && row.status !== "resolvida";
}

async function memberEmails(organizationId: string): Promise<Map<string, string>> {
  const members = await membersService.list(organizationId);
  return new Map(members.map((m) => [m.user_id, m.email]));
}

function toAssignment(row: AssignmentRow, emails: Map<string, string>) {
  return {
    status: row.status,
    assignedUserId: row.assigned_user_id,
    assignedUserEmail: row.assigned_user_id ? (emails.get(row.assigned_user_id) ?? null) : null,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  };
}

async function requireReplyable(organizationId: string, conversationId: string) {
  const conversation = await conversationsService.get(organizationId, conversationId);
  if (!conversation) throw new ConversationNotFoundError();
  if (conversation.channel !== "widget") throw new ChannelNotSupportedError();
  return conversation;
}

async function notify(organizationId: string, conversationId: string, extra?: InboxEvent) {
  await realtime.publish(organizationId, { kind: "conversation_changed", conversationId });
  if (extra) await realtime.publish(organizationId, extra);
}

export const inboxService = {
  async list(organizationId: string, view: InboxView, userId: string) {
    if (view === "assistente") {
      const recent = await conversationsService.listSummaries(organizationId, {
        channel: "widget",
        limit: 100,
      });
      const withHuman = new Set(
        await assignmentsRepository.activeAmong(
          organizationId,
          recent.map((c) => c.id),
        ),
      );
      return recent
        .filter((c) => !withHuman.has(c.id))
        .slice(0, 50)
        .map((c) => ({ ...c, assignment: null }));
    }

    const rows = await assignmentsRepository.list(organizationId, view, userId);
    const byId = new Map(rows.map((r) => [r.conversation_id, r]));
    const [summaries, emails] = await Promise.all([
      conversationsService.listSummaries(organizationId, { ids: [...byId.keys()] }),
      memberEmails(organizationId),
    ]);
    return summaries.map((c) => ({ ...c, assignment: toAssignment(byId.get(c.id)!, emails) }));
  },

  async get(organizationId: string, conversationId: string) {
    const conversation = await conversationsService.getWithMessages(organizationId, conversationId);
    if (!conversation) return null;

    const [row, notes, emails] = await Promise.all([
      assignmentsRepository.find(organizationId, conversationId),
      notesRepository.listFor(organizationId, conversationId),
      memberEmails(organizationId),
    ]);
    const emailOf = (id: string | null) => (id ? (emails.get(id) ?? null) : null);

    return {
      ...conversation,
      messages: conversation.messages.map((m) => ({
        ...m,
        author_email: emailOf(m.author_user_id),
      })),
      assignment: row ? toAssignment(row, emails) : null,
      notes: notes.map((n) => ({ ...n, author_email: emailOf(n.author_user_id) })),
    };
  },

  /** Enquanto ha humano na conversa, o assistente nao responde (ADR-006 #5). */
  async isWithHuman(organizationId: string, conversationId: string): Promise<boolean> {
    return isActive(await assignmentsRepository.find(organizationId, conversationId));
  },

  /** Visitante pediu atendente no widget: entra na fila, sem atribuicao. */
  async requestHuman(organizationId: string, conversationId: string) {
    const current = await assignmentsRepository.find(organizationId, conversationId);
    if (isActive(current)) return current;

    const row = await assignmentsRepository.upsert(organizationId, conversationId, {
      status: "aberta",
      assignedUserId: null,
      newRequest: true,
    });
    await notify(organizationId, conversationId, {
      kind: "status",
      conversationId,
      status: "aberta",
    });
    return row;
  },

  /** Visitante respondeu a uma conversa que aguardava ele: volta para aberta. */
  async onVisitorMessage(organizationId: string, conversationId: string) {
    const current = await assignmentsRepository.find(organizationId, conversationId);
    if (current?.status === "pendente") {
      await assignmentsRepository.upsert(organizationId, conversationId, {
        status: "aberta",
        assignedUserId: current.assigned_user_id,
      });
    }
    await notify(organizationId, conversationId);
  },

  /** Avisa o painel de mensagem nova numa conversa que segue com o assistente. */
  touched(organizationId: string, conversationId: string) {
    return notify(organizationId, conversationId);
  },

  /**
   * Administrador atribui a qualquer pessoa que atende; Atendente so assume
   * para si ou devolve a fila uma conversa que e dele.
   */
  async assign(
    actor: InboxActor,
    organizationId: string,
    conversationId: string,
    assigneeUserId: string | null,
  ) {
    await requireReplyable(organizationId, conversationId);
    const current = await assignmentsRepository.find(organizationId, conversationId);

    if (actor.role !== "Administrador") {
      const takingForSelf = assigneeUserId === actor.userId;
      const releasingOwn = assigneeUserId === null && current?.assigned_user_id === actor.userId;
      if (!takingForSelf && !releasingOwn) throw new ForbiddenAssignmentError();
    }

    if (assigneeUserId) {
      const role = await membersService.roleOf(organizationId, assigneeUserId);
      if (!role || !AGENT_ROLES.includes(role)) throw new InvalidAssigneeError();
    }

    const status: InboxStatus = isActive(current) ? current.status : "aberta";
    const row = await assignmentsRepository.upsert(organizationId, conversationId, {
      status,
      assignedUserId: assigneeUserId,
    });

    await auditService.record({
      actorUserId: actor.userId,
      organizationId,
      action: assigneeUserId ? "Atribuiu conversa" : "Devolveu conversa para a fila",
      type: "conteudo",
      target: conversationId,
    });
    await notify(organizationId, conversationId, { kind: "status", conversationId, status });
    return row;
  },

  async setStatus(
    actor: InboxActor,
    organizationId: string,
    conversationId: string,
    status: InboxStatus,
  ) {
    await requireReplyable(organizationId, conversationId);
    const current = await assignmentsRepository.find(organizationId, conversationId);

    const row = await assignmentsRepository.upsert(organizationId, conversationId, {
      status,
      assignedUserId: current?.assigned_user_id ?? null,
    });

    await auditService.record({
      actorUserId: actor.userId,
      organizationId,
      action: `Marcou conversa como ${status}`,
      type: "conteudo",
      target: conversationId,
    });
    await notify(organizationId, conversationId, { kind: "status", conversationId, status });
    return row;
  },

  /** Responder assume a conversa se ela estiver livre (ADR-006 #3: toda
   * mensagem enviada tem um responsavel humano identificavel). */
  async reply(actor: InboxActor, organizationId: string, conversationId: string, content: string) {
    await requireReplyable(organizationId, conversationId);
    const current = await assignmentsRepository.find(organizationId, conversationId);

    if (
      isActive(current) &&
      current.assigned_user_id &&
      current.assigned_user_id !== actor.userId
    ) {
      throw new AssignedToAnotherUserError();
    }

    await assignmentsRepository.upsert(organizationId, conversationId, {
      status: isActive(current) ? current.status : "aberta",
      assignedUserId: actor.userId,
    });
    const message = await conversationsService.addAgentMessage(
      conversationId,
      content,
      actor.userId,
    );

    // A trilha registra quem respondeu, nunca o conteudo.
    await auditService.record({
      actorUserId: actor.userId,
      organizationId,
      action: "Respondeu conversa",
      type: "conteudo",
      target: conversationId,
    });
    await notify(organizationId, conversationId, {
      kind: "agent_message",
      conversationId,
      content: message.content,
      createdAt: new Date(message.created_at).toISOString(),
    });
    return message;
  },

  async addNote(
    actor: InboxActor,
    organizationId: string,
    conversationId: string,
    content: string,
  ) {
    const conversation = await conversationsService.get(organizationId, conversationId);
    if (!conversation) throw new ConversationNotFoundError();

    const note = await notesRepository.insert(
      organizationId,
      conversationId,
      actor.userId,
      content,
    );
    await notify(organizationId, conversationId);
    return note;
  },
};
