import type { ConversationChannel, MessageCitation } from "../../db/types.js";
import { conversationsRepository, type ConversationFilters } from "./conversations.repository.js";

export const conversationsService = {
  list(organizationId: string, filters: ConversationFilters) {
    return conversationsRepository.listForOrganization(organizationId, filters);
  },

  get(organizationId: string, id: string) {
    return conversationsRepository.findById(organizationId, id);
  },

  async getWithMessages(organizationId: string, id: string) {
    const conversation = await conversationsRepository.findById(organizationId, id);
    if (!conversation) return null;
    const messages = await conversationsRepository.messagesFor(id);
    return { ...conversation, messages };
  },

  start(
    organizationId: string,
    assistantId: string,
    channel: ConversationChannel,
    visitorId: string | null = null,
  ) {
    return conversationsRepository.start(organizationId, assistantId, channel, visitorId);
  },

  async startOrResume(
    organizationId: string,
    assistantId: string,
    channel: ConversationChannel,
    visitorId: string | null = null,
  ) {
    if (visitorId) {
      const existing = await conversationsRepository.findActiveForVisitor(
        organizationId,
        assistantId,
        visitorId,
      );
      if (existing) {
        const messages = await conversationsRepository.messagesFor(existing.id);
        return { conversation: existing, isResumed: true, messages };
      }
    }
    const newConv = await conversationsRepository.start(
      organizationId,
      assistantId,
      channel,
      visitorId,
    );
    return { conversation: newConv, isResumed: false, messages: [] };
  },

  addVisitorMessage(conversationId: string, content: string) {
    return conversationsRepository.addMessage(conversationId, "visitante", content);
  },

  addAssistantMessage(conversationId: string, content: string, citations: MessageCitation[] = []) {
    return conversationsRepository.addMessage(conversationId, "assistente", content, citations);
  },

  /** Resposta de um atendente humano: guarda quem respondeu (ADR-006 #3). */
  addAgentMessage(conversationId: string, content: string, authorUserId: string) {
    return conversationsRepository.addMessage(
      conversationId,
      "atendente",
      content,
      [],
      authorUserId,
    );
  },

  /**
   * Resumo para a fila da caixa de entrada: visitante e ultima mensagem.
   * Ordem: atividade mais recente primeiro.
   */
  async listSummaries(
    organizationId: string,
    options: {
      ids?: string[];
      channel?: ConversationChannel;
      contactId?: string;
      limit?: number;
    },
  ) {
    if (options.ids && options.ids.length === 0) return [];
    const conversations = await conversationsRepository.listWithVisitor(organizationId, {
      ...options,
      limit: options.limit ?? 100,
    });
    if (conversations.length === 0) return [];

    const last = await conversationsRepository.lastMessages(conversations.map((c) => c.id));
    const lastById = new Map(last.map((m) => [m.conversation_id, m]));

    return conversations
      .map((c) => {
        const message = lastById.get(c.id);
        return {
          ...c,
          last_message: message
            ? { role: message.role, content: message.content, created_at: message.created_at }
            : null,
          last_activity_at: message?.created_at ?? c.started_at,
        };
      })
      .sort((a, b) => +new Date(b.last_activity_at) - +new Date(a.last_activity_at));
  },

  /** Liga a conversa a um contato do CRM (ADR-006 #8). */
  setContact(organizationId: string, conversationId: string, contactId: string) {
    return conversationsRepository.setContact(organizationId, conversationId, contactId);
  },

  setContactForVisitor(organizationId: string, visitorId: string, contactId: string) {
    return conversationsRepository.setContactForVisitor(organizationId, visitorId, contactId);
  },

  /** Excluir um contato apaga as conversas dele (LGPD). */
  deleteForContact(organizationId: string, contactId: string) {
    return conversationsRepository.deleteForContact(organizationId, contactId);
  },

  recordFeedback(conversationId: string, rating: "positivo" | "negativo") {
    return conversationsRepository.addFeedback(conversationId, rating);
  },
};
