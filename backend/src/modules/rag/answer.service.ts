import { assistantsService, handoffService } from "../assistants/index.js";
import { conversationsService, gapsService, visitorsService } from "../conversations/index.js";
import { usageService } from "../analytics/index.js";
import { retrievalService } from "./retrieval.service.js";
import { detectSmalltalk, smalltalkReply } from "./smalltalk.js";
import { resolveProviderForTenant } from "./provider-resolver.js";
import type { ChatMessage } from "./provider.types.js";

export class AssistantNotFoundError extends Error {}

/**
 * Texto que o visitante le, nao diagnostico interno. A versao anterior
 * ("Nao encontrei essa informacao na base de conhecimento configurada")
 * expunha jargao do produto a quem so quer uma resposta, e oferecia atendente
 * mesmo quando o assistente nao tinha nenhum WhatsApp configurado — promessa
 * que o widget nao tinha como cumprir.
 */
function noContextReply(hasHandoff: boolean): string {
  return hasHandoff
    ? "Não consigo responder isso agora. Se preferir, fale com um atendente pelo WhatsApp no botão abaixo."
    : "Não consigo responder isso agora. Tente perguntar de outro jeito ou com mais detalhes.";
}

/**
 * Sentinela que o modelo devolve quando o contexto recuperado nao responde a
 * pergunta. Sem isso a lacuna se perdia: a recuperacao trazia chunks (passava
 * do limiar), o modelo respondia "nao encontrei" em texto livre, e como
 * `sufficientContext` era true nada era registrado — justamente a pergunta que
 * mais interessa para melhorar a base. Detectar por sentinela e deterministico;
 * comparar a frase em texto livre nao seria.
 */
const NO_ANSWER_SENTINEL = "__SEM_RESPOSTA_NA_BASE__";

function buildSystemPrompt(instructions: string | null, context: string[], visitorContext: string | null): string {
  const base =
    "Voce e um assistente que responde EXCLUSIVAMENTE com base no CONTEXTO abaixo. " +
    `Se o contexto nao contiver a resposta, responda APENAS com o texto ${NO_ANSWER_SENTINEL} ` +
    "e mais nada. Nunca invente informacao fora do contexto.";
  const withInstructions = instructions ? `${base}\n\nInstrucoes adicionais do assistente: ${instructions}` : base;
  const withVisitor = visitorContext
    ? `${withInstructions}\n\nDados do atendimento atual (use so para personalizar o tom, nunca como fonte de fatos da base): ${visitorContext}`
    : withInstructions;
  return `${withVisitor}\n\nCONTEXTO:\n${context.join("\n---\n")}`;
}

/** Quantas mensagens anteriores acompanham a pergunta. Suficiente para
 * resolver referencia do tipo "e o dele?" sem inflar o prompt. */
const HISTORY_MESSAGES = 6;

/**
 * Sem historico, cada mensagem era tratada isoladamente e "e o CPF?" nao tinha
 * como saber de quem — o visitante recebia "nao encontrei na base" mesmo com o
 * dado indexado, e a pergunta ainda virava lacuna falsa.
 */
async function loadRecentHistory(organizationId: string, conversationId?: string): Promise<ChatMessage[]> {
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
async function loadVisitorContext(organizationId: string, conversationId?: string): Promise<string | null> {
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
    question: string,
    options: { conversationId?: string; environment?: "teste" | "producao" } = {},
  ) {
    const startedAt = Date.now();
    const environment = options.environment ?? "producao";
    const assistant = await assistantsService.get(organizationId, assistantId);
    if (!assistant) throw new AssistantNotFoundError();

    const conversationId =
      options.conversationId ?? (await conversationsService.start(organizationId, assistantId, "playground")).id;

    // Lido antes de gravar a pergunta atual, senao ela viraria "historico" dela mesma.
    const history = await loadRecentHistory(organizationId, options.conversationId);

    await conversationsService.addVisitorMessage(conversationId, question);

    // Cortesia nao passa pela base: responder "nao encontrei na base" a um
    // "oi" faz o produto parecer quebrado e suja a lista de lacunas.
    const smalltalk = detectSmalltalk(question);
    if (smalltalk) {
      const reply = smalltalkReply(smalltalk);
      await conversationsService.addAssistantMessage(conversationId, reply);
      return { conversationId, answer: reply, usedContext: false };
    }

    const retrievalQuery = buildRetrievalQuery(question, history);
    const contextSnippet = buildContextSnippet(history);

    const recordNoAnswer = async (reason: "sem_recuperacao" | "modelo_nao_respondeu") => {
      // So oferece atendente se houver WhatsApp configurado para este assistente.
      const sectors = await handoffService.list(assistantId);
      const answer = noContextReply(sectors.length > 0);

      await gapsService.recordOccurrence(organizationId, assistantId, retrievalQuery, {
        originalQuestion: question,
        contextSnippet,
      });
      await conversationsService.addAssistantMessage(conversationId, answer);
      await usageService.record({
        organizationId,
        assistantId,
        type: "no_context",
        payload: { latencyMs: Date.now() - startedAt, reason },
      });
      return { conversationId, answer, usedContext: false };
    };

    const retrieval = await retrievalService.retrieve(organizationId, assistantId, retrievalQuery, environment);

    if (!retrieval.sufficientContext) return recordNoAnswer("sem_recuperacao");

    const visitorContext = await loadVisitorContext(organizationId, options.conversationId);
    const provider = await resolveProviderForTenant(organizationId, environment);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: buildSystemPrompt(assistant.instructions, retrieval.chunks.map((c) => c.content), visitorContext),
      },
      ...history,
      { role: "user", content: question },
    ];

    const reply = await provider.chat(messages, assistant.model_id);

    // Recuperou contexto, mas o contexto nao responde a pergunta: conta como
    // lacuna igual, senao a pergunta some do radar do tenant.
    if (reply.includes(NO_ANSWER_SENTINEL)) return recordNoAnswer("modelo_nao_respondeu");

    await conversationsService.addAssistantMessage(conversationId, reply);

    await usageService.record({
      organizationId,
      assistantId,
      type: "rag_query",
      payload: { latencyMs: Date.now() - startedAt, model: assistant.model_id, chunksUsed: retrieval.chunks.length },
    });

    return { conversationId, answer: reply, usedContext: true };
  },
};
