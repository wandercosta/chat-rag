import { auditService } from "../audit/index.js";
import { contactsService } from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { membersService } from "../identity/index.js";
import { realtime, type InboxEvent } from "../../realtime/events.js";
import type { InboxStatus, TenantRole } from "../../db/types.js";
import { assignmentsRepository, type AssignmentView } from "./assignments.repository.js";
import { notesRepository } from "./notes.repository.js";
import { inboxSystemActions } from "./system-actions.js";
import {
  AssignedToAnotherUserError,
  ChannelNotSupportedError,
  ConversationNotFoundError,
  OutsideWindowError,
  assertWindowOpen,
  claimForReply,
  replyWindowEndsAt,
  requireReplyable,
  type InboxActor,
} from "./reply.js";
import { enqueueChannelJob } from "../../queue/channel-messages.queue.js";

export {
  AssignedToAnotherUserError,
  ChannelNotSupportedError,
  ConversationNotFoundError,
  OutsideWindowError,
};
export type { InboxActor };

export class InvalidAssigneeError extends Error {}
export class ForbiddenAssignmentError extends Error {}

export type InboxView = AssignmentView | "assistente";

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

/** Nome do contato do CRM (etapa 3) no lugar do "visitante anonimo". */
async function withContactLabels<T extends { contact_id: string | null }>(
  organizationId: string,
  conversations: T[],
) {
  const ids = conversations.flatMap((c) => (c.contact_id ? [c.contact_id] : []));
  const labels = await contactsService.labelsFor(organizationId, ids);
  return conversations.map((c) => ({
    ...c,
    contact_label: c.contact_id ? (labels.get(c.contact_id) ?? null) : null,
  }));
}

async function notify(organizationId: string, conversationId: string, extra?: InboxEvent) {
  await realtime.publish(organizationId, { kind: "conversation_changed", conversationId });
  if (extra) await realtime.publish(organizationId, extra);
}

const inboxCore = {
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
      const free = recent.filter((c) => !withHuman.has(c.id)).slice(0, 50);
      return (await withContactLabels(organizationId, free)).map((c) => ({
        ...c,
        assignment: null,
      }));
    }

    const rows = await assignmentsRepository.list(organizationId, view, userId);
    const byId = new Map(rows.map((r) => [r.conversation_id, r]));
    const [summaries, emails] = await Promise.all([
      conversationsService.listSummaries(organizationId, { ids: [...byId.keys()] }),
      memberEmails(organizationId),
    ]);
    return (await withContactLabels(organizationId, summaries)).map((c) => ({
      ...c,
      assignment: toAssignment(byId.get(c.id)!, emails),
    }));
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
    const [withLabel] = await withContactLabels(organizationId, [conversation]);

    return {
      ...withLabel,
      messages: conversation.messages.map((m) => ({
        ...m,
        author_email: emailOf(m.author_user_id),
      })),
      assignment: row ? toAssignment(row, emails) : null,
      replyWindowEndsAt: await replyWindowEndsAt(conversation.id, conversation.channel),
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
    const conversation = await requireReplyable(organizationId, conversationId);
    await assertWindowOpen(conversationId, conversation.channel);
    await claimForReply(actor, organizationId, conversationId);
    const message = await conversationsService.addAgentMessage(
      conversationId,
      content,
      actor.userId,
    );

    // Canal externo: o envio vai pela fila (com novas tentativas) e o recibo
    // do provedor atualiza o status. O widget recebe pelo tempo real.
    if (conversation.channel !== "widget") {
      await conversationsService.setDelivery(message.id, { status: "enviando" });
      await enqueueChannelJob({ kind: "outbound", organizationId, messageId: message.id });
    }

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

  claimForReply,

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

/** Interface publica: acoes de quem atende (acima) e de automacoes. */
export const inboxService = { ...inboxCore, ...inboxSystemActions };
