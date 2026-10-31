import { auditService } from "../audit/index.js";
import { conversationsService } from "../conversations/index.js";
import { membersService } from "../identity/index.js";
import { webhooksService } from "../webhooks/index.js";
import { realtime, type InboxEvent } from "../../realtime/events.js";
import type { InboxStatus, TenantRole } from "../../db/types.js";
import { assignmentsRepository } from "./assignments.repository.js";
import { inboxViews, isActive } from "./inbox-views.js";
import { notesRepository } from "./notes.repository.js";
import { inboxSystemActions } from "./system-actions.js";
import {
  AssignedToAnotherUserError,
  ChannelNotSupportedError,
  ConversationNotFoundError,
  OutsideWindowError,
  assertWindowOpen,
  claimForReply,
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

export type { InboxView, InboxViewer } from "./inbox-views.js";

export class InvalidAssigneeError extends Error {}
export class ForbiddenAssignmentError extends Error {}

/** Quem pode receber e responder conversas. */
const AGENT_ROLES: readonly TenantRole[] = ["Administrador", "Atendente"];

async function notify(organizationId: string, conversationId: string, extra?: InboxEvent) {
  await realtime.publish(organizationId, { kind: "conversation_changed", conversationId });
  if (extra) await realtime.publish(organizationId, extra);
}

const inboxCore = {
  list: inboxViews.list,
  get: inboxViews.get,

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
    if (status === "resolvida" && current?.status !== "resolvida") {
      await webhooksService.emit(organizationId, "conversa.resolvida", {
        conversationId,
        resolvedBy: actor.userId,
        assignedUserId: row.assigned_user_id,
        resolvedAt: new Date().toISOString(),
      });
    }
    await notify(organizationId, conversationId, { kind: "status", conversationId, status });
    return row;
  },

  /** Responder assume a conversa se ela estiver livre (ADR-006 #3: toda
   * mensagem enviada tem um responsavel humano identificavel). */
  async reply(actor: InboxActor, organizationId: string, conversationId: string, content: string) {
    const conversation = await requireReplyable(organizationId, conversationId);
    await assertWindowOpen(conversation);
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
