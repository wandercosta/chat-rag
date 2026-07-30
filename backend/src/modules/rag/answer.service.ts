import { assistantsService } from "../assistants/index.js";
import { conversationsService, gapsService, visitorsService } from "../conversations/index.js";
import { usageService } from "../analytics/index.js";
import { retrievalService } from "./retrieval.service.js";
import { resolveProviderForTenant } from "./provider-resolver.js";
import type { ChatMessage } from "./provider.types.js";

export class AssistantNotFoundError extends Error {}

const NO_CONTEXT_REPLY =
  "Nao encontrei essa informacao na base de conhecimento configurada. Posso encaminhar para um atendente.";

function buildSystemPrompt(instructions: string | null, context: string[], visitorContext: string | null): string {
  const base =
    "Voce e um assistente que responde EXCLUSIVAMENTE com base no CONTEXTO abaixo. " +
    "Se o contexto nao contiver a resposta, diga que nao encontrou a informacao na base. " +
    "Nunca invente informacao fora do contexto.";
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

    const retrieval = await retrievalService.retrieve(organizationId, assistantId, question, environment);

    if (!retrieval.sufficientContext) {
      await gapsService.recordOccurrence(organizationId, assistantId, question);
      await conversationsService.addAssistantMessage(conversationId, NO_CONTEXT_REPLY);
      await usageService.record({
        organizationId,
        assistantId,
        type: "no_context",
        payload: { latencyMs: Date.now() - startedAt },
      });
      return { conversationId, answer: NO_CONTEXT_REPLY, usedContext: false };
    }

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
