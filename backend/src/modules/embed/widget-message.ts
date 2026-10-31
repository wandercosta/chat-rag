import { onIncomingMessage } from "../automations/index.js";
import { conversationsService } from "../conversations/index.js";
import { inboxService } from "../inbox/index.js";
import { answerService } from "../rag/index.js";
import type { ResolvedEmbedKey } from "./public-access.service.js";

type WidgetConversation = NonNullable<
  Awaited<ReturnType<typeof conversationsService.getWithMessages>>
>;

export interface WidgetReply {
  answer: string | null;
  citations: unknown[];
  humanHandling: boolean;
}

/**
 * O que acontece com a mensagem do visitante: com humano na conversa so grava
 * (ADR-006 #5); automacoes antes do assistente (ADR-006 #4); senao o
 * assistente responde pela base. `onDelta` recebe a resposta do modelo em
 * pedacos, quando o widget pediu streaming.
 */
export async function replyToWidgetMessage(
  key: ResolvedEmbedKey,
  conversation: WidgetConversation,
  message: string,
  onDelta?: (text: string) => void,
): Promise<WidgetReply> {
  if (await inboxService.isWithHuman(key.organizationId, conversation.id)) {
    await conversationsService.addVisitorMessage(conversation.id, message);
    await inboxService.onVisitorMessage(key.organizationId, conversation.id);
    return { answer: null, citations: [], humanHandling: true };
  }

  const automation = await onIncomingMessage(key.organizationId, {
    conversationId: conversation.id,
    contactId: conversation.contact_id,
    channel: "widget",
    text: message,
    isFirstMessage: !conversation.messages.some((m) => m.role === "visitante"),
  });
  if (automation.suppressAssistant) {
    await conversationsService.addVisitorMessage(conversation.id, message);
    if (automation.reply) {
      await conversationsService.addAssistantMessage(conversation.id, automation.reply);
    }
    await inboxService.touched(key.organizationId, conversation.id);
    return { answer: automation.reply, citations: [], humanHandling: automation.handedOff };
  }

  const result = await answerService.answer(key.organizationId, key.assistantId, message, {
    conversationId: conversation.id,
    environment: key.environment,
    onDelta,
  });
  await inboxService.touched(key.organizationId, conversation.id);
  return { answer: result.answer, citations: result.citations, humanHandling: false };
}
