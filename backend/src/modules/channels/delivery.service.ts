import { auditService } from "../audit/index.js";
import { contactsService } from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { inboxService, type InboxActor } from "../inbox/index.js";
import { connectionsRepository, templatesRepository } from "./connections.repository.js";
import { ChannelApiError } from "./http.js";
import { providers, secretsOf } from "./providers.js";
import { whatsappClient } from "./whatsapp.client.js";

export class TemplateNotFoundError extends Error {}
export class TemplateParamsError extends Error {}
export class NotAChannelConversationError extends Error {}

const DONE = new Set(["enviada", "entregue", "lida"]);

/**
 * Envia ao canal uma mensagem ja gravada (resposta da IA ou de atendente).
 * Idempotente: mensagem ja aceita pelo provedor nao sai de novo. Falha de
 * dado (numero invalido, fora da janela) fica marcada; falha temporaria
 * (5xx, limite de taxa) relanca para a fila tentar de novo.
 */
export async function deliverMessage(organizationId: string, messageId: string) {
  const message = await conversationsService.findMessage(organizationId, messageId);
  if (!message?.channel_connection_id || !message.contact_id) return;
  if (message.delivery_status && DONE.has(message.delivery_status)) return;

  const connection = await connectionsRepository.findById(
    organizationId,
    message.channel_connection_id,
  );
  const to = connection
    ? await contactsService.channelAddress(organizationId, message.contact_id, connection.provider)
    : null;
  if (!connection || !to) {
    await conversationsService.setDelivery(messageId, {
      status: "falhou",
      error: !connection ? "canal desconectado" : "contato sem endereco neste canal",
    });
    await inboxService.touched(organizationId, message.conversation_id);
    return;
  }

  try {
    const providerMessageId = await providers[connection.provider].sendText(
      connection,
      to,
      message.content,
    );
    await conversationsService.setDelivery(messageId, {
      providerMessageId: providerMessageId ?? undefined,
      status: "enviada",
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "falha no envio";
    await conversationsService.setDelivery(messageId, { status: "falhou", error });
    if (err instanceof ChannelApiError && err.retryable) throw err;
  } finally {
    await inboxService.touched(organizationId, message.conversation_id);
  }
}

/**
 * Modelo aprovado pela Meta, a unica forma de falar com o cliente depois da
 * janela de 24 horas (ADR-006 #9). Quem envia assume a conversa, como numa
 * resposta comum, e a auditoria registra o envio sem o conteudo.
 */
export async function sendTemplateFromPanel(
  actor: InboxActor,
  organizationId: string,
  conversationId: string,
  templateId: string,
  params: string[],
) {
  const conversation = await conversationsService.get(organizationId, conversationId);
  if (
    conversation?.channel !== "whatsapp" ||
    !conversation.channel_connection_id ||
    !conversation.contact_id
  ) {
    throw new NotAChannelConversationError();
  }
  const template = await templatesRepository.find(organizationId, templateId);
  if (
    !template ||
    template.connection_id !== conversation.channel_connection_id ||
    template.status !== "APPROVED"
  ) {
    throw new TemplateNotFoundError();
  }
  if (params.length !== template.variables) throw new TemplateParamsError();

  const connection = await connectionsRepository.findById(
    organizationId,
    conversation.channel_connection_id,
  );
  const to = await contactsService.channelAddress(
    organizationId,
    conversation.contact_id,
    "whatsapp",
  );
  if (!connection || !to) throw new NotAChannelConversationError();

  await inboxService.claimForReply(actor, organizationId, conversationId);
  const rendered = template.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
  const message = await conversationsService.addAgentMessage(
    conversationId,
    rendered,
    actor.userId,
  );
  try {
    const providerMessageId = await whatsappClient.sendTemplate(
      connection.external_id,
      secretsOf(connection).accessToken,
      to,
      { name: template.name, language: template.language, params },
    );
    await conversationsService.setDelivery(message.id, {
      providerMessageId: providerMessageId ?? undefined,
      status: "enviada",
    });
  } catch (err) {
    await conversationsService.setDelivery(message.id, {
      status: "falhou",
      error: err instanceof Error ? err.message : "falha no envio",
    });
  }

  await auditService.record({
    actorUserId: actor.userId,
    organizationId,
    action: `Enviou modelo "${template.name}"`,
    type: "conteudo",
    target: conversationId,
  });
  await inboxService.touched(organizationId, conversationId);
  return conversationsService.findMessage(organizationId, message.id);
}
