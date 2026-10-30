import { conversationsService } from "../conversations/index.js";
import type { ConversationChannel, TenantRole } from "../../db/types.js";
import { assignmentsRepository } from "./assignments.repository.js";

export class ConversationNotFoundError extends Error {}
/** Playground e teste interno: nao tem quem receba resposta humana. */
export class ChannelNotSupportedError extends Error {}
/** Evita duas pessoas respondendo a mesma conversa ao mesmo tempo. */
export class AssignedToAnotherUserError extends Error {}
/** WhatsApp, Instagram e Messenger so aceitam texto livre ate 24 horas depois
 * da ultima mensagem do cliente (7 dias com a tag "Agente humano" no
 * Messenger/Instagram); depois, so modelo aprovado no WhatsApp (ADR-006 #9). */
export class OutsideWindowError extends Error {}

export interface InboxActor {
  userId: string;
  role: TenantRole;
}

const REPLYABLE: ReadonlySet<ConversationChannel> = new Set([
  "widget",
  "whatsapp",
  "telegram",
  "instagram",
  "messenger",
]);
const WINDOW_CHANNELS: ReadonlySet<ConversationChannel> = new Set([
  "whatsapp",
  "instagram",
  "messenger",
]);
const HOUR_MS = 60 * 60 * 1000;

/**
 * Horas da janela de uma conexao: 24 por padrao; 168 no Messenger/Instagram
 * com a tag "Agente humano" ligada. Quem sabe da conexao e o modulo channels,
 * que registra a regra no app.ts (o inbox nao le tabela de outro modulo).
 */
type WindowPolicy = (organizationId: string, connectionId: string) => Promise<number>;
let windowHoursFor: WindowPolicy = async () => 24;

export function setReplyWindowPolicy(policy: WindowPolicy) {
  windowHoursFor = policy;
}

interface WindowedConversation {
  id: string;
  organization_id: string;
  channel: ConversationChannel;
  channel_connection_id: string | null;
}

export async function requireReplyable(organizationId: string, conversationId: string) {
  const conversation = await conversationsService.get(organizationId, conversationId);
  if (!conversation) throw new ConversationNotFoundError();
  if (!REPLYABLE.has(conversation.channel)) throw new ChannelNotSupportedError();
  return conversation;
}

/** Ate quando da para responder com texto livre; null = sem janela (widget,
 * Telegram) ou ja fechada sem mensagem do cliente. */
export async function replyWindowEndsAt(conversation: WindowedConversation): Promise<Date | null> {
  if (!WINDOW_CHANNELS.has(conversation.channel)) return null;
  const last = await conversationsService.lastVisitorMessageAt(conversation.id);
  if (!last) return new Date(0);
  const hours = conversation.channel_connection_id
    ? await windowHoursFor(conversation.organization_id, conversation.channel_connection_id)
    : 24;
  return new Date(last.getTime() + hours * HOUR_MS);
}

export async function assertWindowOpen(conversation: WindowedConversation) {
  const endsAt = await replyWindowEndsAt(conversation);
  if (endsAt && endsAt.getTime() < Date.now()) throw new OutsideWindowError();
}

/**
 * Quem responde assume a conversa se ela estiver livre (ADR-006 #3: toda
 * mensagem enviada tem um responsavel humano identificavel). Se outra pessoa
 * ja assumiu, recusa.
 */
export async function claimForReply(
  actor: InboxActor,
  organizationId: string,
  conversationId: string,
) {
  const current = await assignmentsRepository.find(organizationId, conversationId);
  const active = !!current && current.status !== "resolvida";
  if (active && current.assigned_user_id && current.assigned_user_id !== actor.userId) {
    throw new AssignedToAnotherUserError();
  }
  return assignmentsRepository.upsert(organizationId, conversationId, {
    status: active ? current.status : "aberta",
    assignedUserId: actor.userId,
  });
}
