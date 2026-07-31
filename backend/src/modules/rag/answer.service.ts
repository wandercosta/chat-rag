import { assistantsService } from "../assistants/index.js";
import { conversationsService, gapsService, visitorsService } from "../conversations/index.js";
import { usageService } from "../analytics/index.js";
import { retrievalService } from "./retrieval.service.js";
import { resolveProviderForTenant } from "./provider-resolver.js";
import type { ChatMessage } from "./provider.types.js";

export class AssistantNotFoundError extends Error {}

const NO_CONTEXT_REPLY =
  "Nao encontrei essa informacao na base de conhecimento configurada. Posso encaminhar para um atendente.";

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

    await conversationsService.addVisitorMessage(conversationId, question);

    const recordNoAnswer = async (reason: "sem_recuperacao" | "modelo_nao_respondeu") => {
      await gapsService.recordOccurrence(organizationId, assistantId, question);
      await conversationsService.addAssistantMessage(conversationId, NO_CONTEXT_REPLY);
      await usageService.record({
        organizationId,
        assistantId,
        type: "no_context",
        payload: { latencyMs: Date.now() - startedAt, reason },
      });
      return { conversationId, answer: NO_CONTEXT_REPLY, usedContext: false };
    };

    const retrieval = await retrievalService.retrieve(organizationId, assistantId, question, environment);

    if (!retrieval.sufficientContext) return recordNoAnswer("sem_recuperacao");

    const visitorContext = await loadVisitorContext(organizationId, options.conversationId);
    const provider = await resolveProviderForTenant(organizationId, environment);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: buildSystemPrompt(assistant.instructions, retrieval.chunks.map((c) => c.content), visitorContext),
      },
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
