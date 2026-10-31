import { realtime } from "../../realtime/events.js";
import { membersService } from "../identity/index.js";
import { organizationsService } from "../organizations/index.js";
import { messagesRepository } from "./messages.repository.js";
import { orderedPair, threadsRepository } from "./threads.repository.js";

export class ThreadNotFoundError extends Error {}
/** Conversa direta com quem nao e (ou deixou de ser) da organizacao, ou consigo. */
export class InvalidPeerError extends Error {}

/** Mesmo padrao das conversas (assistants.service): 90 dias sem politica propria. */
const PLATFORM_DEFAULT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** E-mail de cada membro pela interface publica do identity (ADR-002). */
async function emailsOf(organizationId: string) {
  const members = await membersService.list(organizationId);
  return new Map(members.map((m) => [m.user_id, m.email]));
}

const otherOf = (thread: { user_a: string | null; user_b: string | null }, me: string) =>
  thread.user_a === me ? thread.user_b : thread.user_a;

/**
 * Chat interno da equipe do tenant: canal Geral da organizacao e conversas
 * diretas entre duas pessoas. So membros da organizacao: o Master nao le,
 * nem com sessao de suporte (conversa entre colegas nao e dado de suporte).
 */
export const teamChatService = {
  async people(organizationId: string, me: string) {
    const members = await membersService.list(organizationId);
    return members
      .filter((m) => m.user_id !== me)
      .map((m) => ({ userId: m.user_id, email: m.email, role: m.role }));
  },

  async listThreads(organizationId: string, me: string) {
    await threadsRepository.ensureGeneral(organizationId);
    const [rows, emails] = await Promise.all([
      threadsRepository.listForUser(organizationId, me),
      emailsOf(organizationId),
    ]);
    return rows.map((t) => {
      const other = t.kind === "direto" ? otherOf(t, me) : null;
      return {
        id: t.id,
        kind: t.kind,
        otherUserId: other,
        otherEmail: other ? (emails.get(other) ?? null) : null,
        lastMessageAt: t.last_message_at,
        lastMessage: t.last_message,
        lastAuthorEmail: t.last_author_user_id ? (emails.get(t.last_author_user_id) ?? null) : null,
        unread: Number(t.unread),
      };
    });
  },

  async openDirect(organizationId: string, me: string, otherUserId: string) {
    if (otherUserId === me) throw new InvalidPeerError();
    const emails = await emailsOf(organizationId);
    if (!emails.has(otherUserId)) throw new InvalidPeerError();
    const thread = await threadsRepository.findOrCreateDirect(organizationId, me, otherUserId);
    return { id: thread.id, kind: thread.kind, otherUserId, otherEmail: emails.get(otherUserId)! };
  },

  /** A pagina mais recente marca a thread como lida para quem le. */
  async messages(organizationId: string, me: string, threadId: string, before?: Date) {
    const thread = await threadsRepository.findAccessible(organizationId, threadId, me);
    if (!thread) throw new ThreadNotFoundError();
    const [rows, emails] = await Promise.all([
      messagesRepository.list(threadId, before),
      emailsOf(organizationId),
    ]);
    if (!before) await threadsRepository.markRead(threadId, me, new Date());
    return rows.map((m) => ({
      id: m.id,
      authorUserId: m.author_user_id,
      // Quem saiu da organizacao (ou foi excluido) fica sem e-mail.
      authorEmail: m.author_user_id ? (emails.get(m.author_user_id) ?? null) : null,
      content: m.content,
      createdAt: m.created_at,
    }));
  },

  async send(organizationId: string, me: string, threadId: string, content: string) {
    const thread = await threadsRepository.findAccessible(organizationId, threadId, me);
    if (!thread) throw new ThreadNotFoundError();
    const emails = await emailsOf(organizationId);
    const other = thread.kind === "direto" ? otherOf(thread, me) : null;
    if (other && !emails.has(other)) throw new InvalidPeerError();

    const message = await messagesRepository.insert(organizationId, threadId, me, content);
    await threadsRepository.markRead(threadId, me, message.created_at);
    await realtime.publish(organizationId, {
      kind: "team_message",
      threadId,
      authorUserId: me,
      participants: other ? orderedPair(me, other) : null,
    });
    return {
      id: message.id,
      authorUserId: message.author_user_id,
      authorEmail: emails.get(me) ?? null,
      content: message.content,
      createdAt: message.created_at,
    };
  },

  /** Worker de retencao: apaga mensagens alem do prazo de cada organizacao. */
  async purgeExpired() {
    const summary: { organizationId: string; deleted: number }[] = [];
    for (const organizationId of await messagesRepository.organizationsWithMessages()) {
      const { days } = await organizationsService.getRetentionPolicy(organizationId);
      const cutoff = new Date(Date.now() - (days ?? PLATFORM_DEFAULT_RETENTION_DAYS) * DAY_MS);
      const deleted = await messagesRepository.deleteOlderThan(organizationId, cutoff);
      if (deleted > 0) summary.push({ organizationId, deleted });
    }
    return summary;
  },
};
