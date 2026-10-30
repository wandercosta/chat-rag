import { assistantsService } from "../assistants/index.js";
import { contactsService } from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { inboxService } from "../inbox/index.js";
import { answerService } from "../rag/index.js";
import { onIncomingMessage } from "../automations/index.js";
import type { ChannelProvider, DeliveryStatus } from "../../db/types.js";
import type { InboundMessage } from "../../queue/channel-messages.queue.js";
import { connectionsRepository } from "./connections.repository.js";
import { deliverMessage } from "./delivery.service.js";
import { providers } from "./providers.js";

/** Depois de um dia sem mensagens, a proxima abre uma conversa nova. */
const CONVERSATION_IDLE_MS = 24 * 60 * 60 * 1000;

/** "Quero falar com um atendente", "tem algum humano?"... */
const ASKS_FOR_HUMAN = /\b(atendente|humano|humana|falar com (uma )?pessoa)\b/i;

/** Pedido de sair das campanhas, sozinho na mensagem (ADR-006 #9). */
const OPT_OUT = /^\s*(sair|parar|stop|descadastrar)\s*[.!]?\s*$/i;

/** Nos canais nao ha painel de fontes: as citacoes vao no fim do texto. */
function withSources(answer: string, citations: { index: number; sourceTitle: string }[]) {
  if (citations.length === 0) return answer;
  const lines = citations.map((c) => `[${c.index}] ${c.sourceTitle}`);
  return `${answer}\n\nFontes:\n${lines.join("\n")}`;
}

/** Conversa em andamento com o contato nesta conexao, ou uma nova. */
async function conversationFor(
  organizationId: string,
  connection: { id: string; assistant_id: string; provider: ChannelProvider },
  contactId: string,
) {
  const latest = await conversationsService.findLatestForChannel(
    organizationId,
    connection.id,
    contactId,
  );
  if (latest) {
    if (await inboxService.isWithHuman(organizationId, latest.id)) return latest;
    const last = await conversationsService.lastMessageAt(latest.id);
    if (last && Date.now() - last.getTime() < CONVERSATION_IDLE_MS) return latest;
  }
  return conversationsService.startForChannel(
    organizationId,
    connection.assistant_id,
    connection.provider,
    connection.id,
    contactId,
  );
}

/**
 * Mensagem recebida por um canal (worker). Mesmo caminho do widget: com humano
 * na conversa, so grava e avisa o painel; senao, o assistente responde pela
 * base (ADR-006 #4). Pedido explicito de atendente, ou pergunta sem resposta
 * na base com a caixa de entrada ligada, poe a conversa na fila.
 */
export async function processInbound(connectionId: string, message: InboundMessage) {
  const connection = await connectionsRepository.findByIdForWebhook(connectionId);
  if (!connection || connection.status === "inativo") return;
  const organizationId = connection.organization_id;

  // O mesmo evento pode chegar duas vezes (a Meta reenvia em caso de duvida).
  if (
    await conversationsService.findMessageByProviderId(organizationId, message.providerMessageId)
  ) {
    return;
  }

  const contactId = await contactsService.resolveForChannel(
    organizationId,
    connection.provider,
    message.from,
    { name: message.name, phone: providers[connection.provider].phoneFrom(message.from) },
  );
  const conversation = await conversationFor(organizationId, connection, contactId);

  if (OPT_OUT.test(message.text)) {
    await contactsService.optOut(organizationId, contactId);
    await conversationsService.addVisitorMessage(
      conversation.id,
      message.text,
      message.providerMessageId,
    );
    const reply = await conversationsService.addAssistantMessage(
      conversation.id,
      "Pronto! Voce nao vai mais receber nossas campanhas. Se precisar de algo, e so escrever.",
    );
    await deliverMessage(organizationId, reply.id);
    await inboxService.touched(organizationId, conversation.id);
    return;
  }

  if (await inboxService.isWithHuman(organizationId, conversation.id)) {
    await conversationsService.addVisitorMessage(
      conversation.id,
      message.text,
      message.providerMessageId,
    );
    await inboxService.onVisitorMessage(organizationId, conversation.id);
    return;
  }

  // Automacoes (ADR-006 #4) antes do assistente; a resposta da regra sai
  // pelo mesmo caminho de entrega do canal.
  const automation = await onIncomingMessage(organizationId, {
    conversationId: conversation.id,
    contactId,
    channel: connection.provider,
    text: message.text,
    isFirstMessage: !(await conversationsService.lastVisitorMessageAt(conversation.id)),
  });
  if (automation.suppressAssistant) {
    await conversationsService.addVisitorMessage(
      conversation.id,
      message.text,
      message.providerMessageId,
    );
    if (automation.reply) {
      const reply = await conversationsService.addAssistantMessage(
        conversation.id,
        automation.reply,
      );
      await deliverMessage(organizationId, reply.id);
    }
    await inboxService.touched(organizationId, conversation.id);
    return;
  }

  const assistant = await assistantsService.get(organizationId, connection.assistant_id);
  if (assistant?.human_inbox_enabled && ASKS_FOR_HUMAN.test(message.text)) {
    await conversationsService.addVisitorMessage(
      conversation.id,
      message.text,
      message.providerMessageId,
    );
    await inboxService.requestHuman(organizationId, conversation.id);
    const reply = await conversationsService.addAssistantMessage(
      conversation.id,
      "Certo! Um atendente vai continuar a conversa por aqui.",
    );
    await deliverMessage(organizationId, reply.id);
    return;
  }

  const result = await answerService.answer(organizationId, connection.assistant_id, message.text, {
    conversationId: conversation.id,
    providerMessageId: message.providerMessageId,
    handoff: "automatico",
  });
  if (result.citations.length > 0) {
    await conversationsService.setContent(
      result.messageId,
      withSources(result.answer, result.citations),
    );
  }
  if (result.handoffRequested) await inboxService.requestHuman(organizationId, conversation.id);
  await inboxService.touched(organizationId, conversation.id);
  await deliverMessage(organizationId, result.messageId);
}

/** Recibo do provedor: enviada, entregue, lida ou falhou. */
export async function processStatus(
  connectionId: string,
  providerMessageId: string,
  status: DeliveryStatus,
  error: string | null,
) {
  const connection = await connectionsRepository.findByIdForWebhook(connectionId);
  if (!connection) return;
  const updated = await conversationsService.updateDeliveryByProviderId(
    connection.organization_id,
    providerMessageId,
    status,
    error,
  );
  if (updated) await inboxService.touched(connection.organization_id, updated.conversation_id);
}
