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
const DAY_MS = 24 * 60 * 60 * 1000;

/** Resposta de atendente no Messenger/Instagram depois das 24 horas, com a
 * tag ligada na conexao (o inbox ja conferiu o limite de 7 dias). */
async function needsHumanAgentTag(
  connection: { provider: string; config: Record<string, string> },
  message: { role: string; conversation_id: string },
) {
  if (message.role !== "atendente" || connection.config.humanAgentTag !== "true") return false;
  if (connection.provider !== "messenger" && connection.provider !== "instagram") return false;
  const last = await conversationsService.lastVisitorMessageAt(message.conversation_id);
  return !!last && Date.now() - last.getTime() > DAY_MS;
}

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
    // So o erro do provedor marca falha; erro ao gravar o recibo nao.
    let providerMessageId: string | null;
    try {
      providerMessageId = await providers[connection.provider].sendText(
        connection,
        to,
        message.content,
        { humanAgent: await needsHumanAgentTag(connection, message) },
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : "falha no envio";
      await conversationsService.setDelivery(messageId, { status: "falhou", error });
      if (err instanceof ChannelApiError && err.retryable) throw err;
      return;
    }
    // Se nem o id do provedor der para gravar, a mensagem segue "enviada" sem
    // ele: tentar de novo mandaria a mesma mensagem duas vezes ao cliente.
    await conversationsService
      .setDelivery(messageId, {
        providerMessageId: providerMessageId ?? undefined,
        status: "enviada",
      })
      .catch(() => conversationsService.setDelivery(messageId, { status: "enviada" }));
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
