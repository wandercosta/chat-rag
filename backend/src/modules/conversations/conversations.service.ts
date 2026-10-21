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

  recordFeedback(conversationId: string, rating: "positivo" | "negativo") {
    return conversationsRepository.addFeedback(conversationId, rating);
  },
};
