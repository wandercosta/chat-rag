import { assistantsService, handoffService } from "../assistants/index.js";
import { conversationsService, gapsService, visitorsService } from "../conversations/index.js";
import { usageService } from "../analytics/index.js";
import { retrievalService } from "./retrieval.service.js";
import {
  NO_ANSWER_SENTINEL,
  buildSystemPrompt,
  citationsUsed,
  extractiveReply,
  noContextReply,
  sanitizeUserInput,
  toCitations,
  type Citation,
} from "./answer.text.js";
import { detectSmalltalk, smalltalkReply } from "./smalltalk.js";
import { NoActiveCredentialError, resolveChatProvider } from "./provider-resolver.js";
import type { ChatMessage } from "./provider.types.js";

export class AssistantNotFoundError extends Error {}
export type { Citation };

/** Quantas mensagens anteriores acompanham a pergunta. Suficiente para
 * resolver referencia do tipo "e o dele?" sem inflar o prompt. */
const HISTORY_MESSAGES = 6;

/**
 * Sem historico, cada mensagem era tratada isoladamente e "e o CPF?" nao tinha
 * como saber de quem — o visitante recebia "nao encontrei na base" mesmo com o
 * dado indexado, e a pergunta ainda virava lacuna falsa.
 */
async function loadRecentHistory(
  organizationId: string,
  conversationId?: string,
): Promise<ChatMessage[]> {
  if (!conversationId) return [];
  const conversation = await conversationsService.getWithMessages(organizationId, conversationId);
  if (!conversation) return [];

  return conversation.messages.slice(-HISTORY_MESSAGES).map((m) => ({
    role: m.role === "visitante" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));
}

/**
 * A recuperacao vetorial nao ve o historico: "e o CPF?" sozinho nao se parece
 * com a ficha cadastral. Pergunta curta de continuidade herda a ultima pergunta
 * do visitante, tanto para a busca vetorial quanto para o registro da lacuna.
 * A pergunta enviada ao modelo continua sendo a original — quem resolve o
 * "dele" ali e o historico, nao a query expandida.
 */
function buildRetrievalQuery(question: string, history: ChatMessage[]): string {
  const words = question.trim().split(/\s+/).length;
  if (words > 6) return question;

  const lastUserQuestion = [...history].reverse().find((m) => m.role === "user")?.content;
  return lastUserQuestion ? `${lastUserQuestion} ${question}` : question;
}

/**
 * Transcricao curta dos turnos anteriores, guardada junto da lacuna. Sem ela,
 * "quantos filhos ele tem?" chega solto na tela de lacunas e quem for
 * responder nao tem como saber de quem se falava.
 */
function buildContextSnippet(history: ChatMessage[]): string | null {
  if (history.length === 0) return null;
  return history
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Visitante" : "Assistente"}: ${m.content}`)
    .join("\n");
}

/** Nome/email/contexto que o sistema hospedeiro passou ao abrir o widget
 * (docs/integrations/widget-embed.md - Contexto do visitante). */
async function loadVisitorContext(
  organizationId: string,
  conversationId?: string,
): Promise<string | null> {
  if (!conversationId) return null;
  const conversation = await conversationsService.get(organizationId, conversationId);
  if (!conversation?.visitor_id) return null;
  const visitor = await visitorsService.findById(conversation.visitor_id);
  if (!visitor) return null;

  const parts: string[] = [];
  if (visitor.name) parts.push(`nome: ${visitor.name}`);
  if (visitor.email) parts.push(`email: ${visitor.email}`);
  if (visitor.context) parts.push(`contexto: ${JSON.stringify(visitor.context)}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

export const answerService = {
  /** Politica de resposta (docs/backend/especificacao-backend.md): busca so
   * chunks acessiveis, e sem relevancia suficiente no modo estrito, registra
   * lacuna e nao usa conhecimento geral. */
  async answer(
    organizationId: string,
    assistantId: string,
    rawQuestion: string,
    options: {
      conversationId?: string;
      environment?: "teste" | "producao";
      /** Id da mensagem no canal (WhatsApp...), para o webhook ser idempotente. */
      providerMessageId?: string;
      /** Canal sem botao de atendente: sem resposta na base e com caixa de
       * entrada ligada, a propria resposta avisa que um humano vai assumir. */
      handoff?: "botao" | "automatico";
    } = {},
  ) {
    const question = sanitizeUserInput(rawQuestion);
    const startedAt = Date.now();
    const environment = options.environment ?? "producao";
    const assistant = await assistantsService.get(organizationId, assistantId);
    if (!assistant) throw new AssistantNotFoundError();

    const conversationId =
      options.conversationId ??
      (await conversationsService.start(organizationId, assistantId, "playground")).id;

    // Lido antes de gravar a pergunta atual, senao ela viraria "historico" dela mesma.
    const history = await loadRecentHistory(organizationId, options.conversationId);

    await conversationsService.addVisitorMessage(
      conversationId,
      question,
      options.providerMessageId,
    );

    // Cortesia nao passa pela base: responder "nao encontrei na base" a um
    // "oi" faz o produto parecer quebrado e suja a lista de lacunas.
    const smalltalk = detectSmalltalk(question);
    if (smalltalk) {
      const reply = smalltalkReply(smalltalk);
      const saved = await conversationsService.addAssistantMessage(conversationId, reply);
      return {
        conversationId,
        messageId: saved.id,
        answer: reply,
        usedContext: false,
        citations: [] as Citation[],
        handoffRequested: false,
      };
    }

    const retrievalQuery = buildRetrievalQuery(question, history);
    const contextSnippet = buildContextSnippet(history);

    const recordNoAnswer = async (reason: "sem_recuperacao" | "modelo_nao_respondeu") => {
      // So oferece atendente se houver para onde mandar: caixa de entrada do
      // painel (ADR-006) ou WhatsApp configurado para este assistente.
      const sectors = assistant.human_inbox_enabled ? [] : await handoffService.list(assistantId);
      const automatic = options.handoff === "automatico" && assistant.human_inbox_enabled;
      const answer = noContextReply(
        automatic
          ? "automatico"
          : assistant.human_inbox_enabled
            ? "painel"
            : sectors.length > 0
              ? "whatsapp"
              : null,
      );

      await gapsService.recordOccurrence(organizationId, assistantId, retrievalQuery, {
        originalQuestion: question,
        contextSnippet,
      });
      const saved = await conversationsService.addAssistantMessage(conversationId, answer);
      await usageService.record({
        organizationId,
        assistantId,
        type: "no_context",
        payload: { latencyMs: Date.now() - startedAt, reason },
      });
      return {
        conversationId,
        messageId: saved.id,
        answer,
        usedContext: false,
        citations: [] as Citation[],
        handoffRequested: automatic,
      };
    };

    let retrieval;
    try {
      retrieval = await retrievalService.retrieve(organizationId, assistantId, retrievalQuery);
    } catch (err) {
      if (err instanceof NoActiveCredentialError) {
        return recordNoAnswer("sem_recuperacao");
      }
      throw err;
    }

    if (!retrieval.sufficientContext) return recordNoAnswer("sem_recuperacao");

    let provider;
    try {
      provider = await resolveChatProvider(organizationId, environment, assistant.model_id);
    } catch (err) {
      if (err instanceof NoActiveCredentialError) return recordNoAnswer("sem_recuperacao");
      throw err;
    }

    const allCitations = toCitations(retrieval.chunks, question);
    let reply: string;
    let citations: Citation[];

    if (provider.kind === "extractive") {
      reply = extractiveReply(allCitations);
      citations = allCitations.slice(0, 1);
    } else {
      const visitorContext = await loadVisitorContext(organizationId, options.conversationId);
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: buildSystemPrompt(
            assistant.instructions,
            retrieval.chunks.map((c) => ({ content: c.content, sourceTitle: c.source_title })),
            visitorContext,
          ),
        },
        ...history,
        { role: "user", content: question },
      ];

      reply = await provider.chat(messages, assistant.model_id);

      // Recuperou contexto, mas o contexto nao responde a pergunta (ou o
      // modelo recusou e devolveu vazio): conta como lacuna igual, senao a
      // pergunta some do radar do tenant.
      if (!reply || reply.includes(NO_ANSWER_SENTINEL)) {
        return recordNoAnswer("modelo_nao_respondeu");
      }
      citations = citationsUsed(reply, allCitations);
    }

    const saved = await conversationsService.addAssistantMessage(conversationId, reply, citations);

    await usageService.record({
      organizationId,
      assistantId,
      type: "rag_query",
      payload: {
        latencyMs: Date.now() - startedAt,
        model: assistant.model_id,
        chunksUsed: retrieval.chunks.length,
      },
    });

    return {
      conversationId,
      messageId: saved.id,
      answer: reply,
      usedContext: true,
      citations,
      handoffRequested: false,
    };
  },
};
