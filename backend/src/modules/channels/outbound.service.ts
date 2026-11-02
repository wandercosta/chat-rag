import { contactsService } from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { inboxService } from "../inbox/index.js";
import { connectionsRepository, templatesRepository } from "./connections.repository.js";
import { ChannelApiError } from "./http.js";
import { providers, secretsOf } from "./providers.js";
import { whatsappClient } from "./whatsapp.client.js";

export type OutboundContent =
  { kind: "template"; templateId: string; params: string[] } | { kind: "text"; text: string };

export type OutboundResult =
  | { status: "enviada"; messageId: string }
  | { status: "falhou"; messageId: string | null; error: string }
  /** Erro temporario do provedor: tentar de novo com o mesmo `messageId`. */
  | { status: "tentar_de_novo"; messageId: string; error: string };

/** Troca {{1}}, {{2}}... pelos valores, como a Meta faz ao entregar. */
export function renderTemplate(body: string, params: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}

/**
 * Mensagem por iniciativa da empresa (campanha) para um contato. Vira uma
 * mensagem de atendente na conversa do contato naquele canal (ADR-006 #3: com
 * o responsavel humano), para a resposta dele cair na caixa de entrada no
 * mesmo lugar. `existingMessageId` reaproveita a mensagem numa nova tentativa.
 */
export async function sendToContact(input: {
  organizationId: string;
  connectionId: string;
  contactId: string;
  actorUserId: string | null;
  content: OutboundContent;
  existingMessageId?: string | null;
}): Promise<OutboundResult> {
  const { organizationId, contactId } = input;
  const connection = await connectionsRepository.findById(organizationId, input.connectionId);
  if (!connection || connection.status === "inativo") {
    return { status: "falhou", messageId: null, error: "canal desconectado" };
  }
  const address = await contactsService.channelAddress(
    organizationId,
    contactId,
    connection.provider,
  );
  if (!address)
    return { status: "falhou", messageId: null, error: "contato sem endereco no canal" };

  let template = null;
  if (input.content.kind === "template") {
    template = await templatesRepository.find(organizationId, input.content.templateId);
    if (!template || template.status !== "APPROVED") {
      return { status: "falhou", messageId: null, error: "modelo nao aprovado" };
    }
    if (template.connection_id !== connection.id) {
      return { status: "falhou", messageId: null, error: "modelo de outro numero" };
    }
  }
  const content =
    input.content.kind === "template"
      ? renderTemplate(template!.body, input.content.params)
      : input.content.text;

  let messageId = input.existingMessageId ?? null;
  if (!messageId) {
    const conversation =
      (await conversationsService.findLatestForChannel(organizationId, connection.id, contactId)) ??
      (await conversationsService.startForChannel(
        organizationId,
        connection.assistant_id,
        connection.provider,
        connection.id,
        contactId,
      ));
    const message = await conversationsService.addAgentMessage(
      conversation.id,
      content,
      input.actorUserId,
    );
    messageId = message.id;
  }

  try {
    // Erro do provedor e erro ao gravar o recibo sao coisas diferentes: uma
    // mensagem que o provedor aceitou nunca pode ficar marcada como falha.
    let providerMessageId: string | null;
    try {
      providerMessageId =
        input.content.kind === "template"
          ? await whatsappClient.sendTemplate(
              connection.external_id,
              secretsOf(connection).accessToken,
              address,
              { name: template!.name, language: template!.language, params: input.content.params },
            )
          : await providers[connection.provider].sendText(connection, address, content);
    } catch (err) {
      const error = err instanceof Error ? err.message : "falha no envio";
      await conversationsService.setDelivery(messageId, { status: "falhou", error });
      if (err instanceof ChannelApiError && err.retryable) {
        return { status: "tentar_de_novo", messageId, error };
      }
      return { status: "falhou", messageId, error };
    }
    // Se nem o id do provedor der para gravar, a mensagem segue "enviada" sem
    // ele: tentar de novo mandaria a mesma mensagem duas vezes ao cliente.
    await conversationsService
      .setDelivery(messageId, {
        providerMessageId: providerMessageId ?? undefined,
        status: "enviada",
      })
      .catch(() => conversationsService.setDelivery(messageId, { status: "enviada" }));
    return { status: "enviada", messageId };
  } finally {
    const message = await conversationsService.findMessage(organizationId, messageId);
    if (message) await inboxService.touched(organizationId, message.conversation_id);
  }
}

/** O que outros modulos (campanhas) precisam saber de uma conexao e de um modelo. */
export const channelsQuery = {
  async connection(organizationId: string, id: string) {
    const c = await connectionsRepository.findById(organizationId, id);
    return c ? { id: c.id, provider: c.provider, status: c.status, name: c.name } : null;
  },

  async template(organizationId: string, id: string) {
    const t = await templatesRepository.find(organizationId, id);
    return t
      ? {
          id: t.id,
          connectionId: t.connection_id,
          name: t.name,
          status: t.status,
          body: t.body,
          variables: t.variables,
        }
      : null;
  },
};
