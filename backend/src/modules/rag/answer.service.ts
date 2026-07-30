import { assistantsService } from "../assistants/index.js";
import { conversationsService, gapsService } from "../conversations/index.js";
import { retrievalService } from "./retrieval.service.js";
import { resolveProviderForTenant } from "./provider-resolver.js";
import type { ChatMessage } from "./provider.types.js";

export class AssistantNotFoundError extends Error {}

const NO_CONTEXT_REPLY =
  "Nao encontrei essa informacao na base de conhecimento configurada. Posso encaminhar para um atendente.";

function buildSystemPrompt(instructions: string | null, context: string[]): string {
  const base =
    "Voce e um assistente que responde EXCLUSIVAMENTE com base no CONTEXTO abaixo. " +
    "Se o contexto nao contiver a resposta, diga que nao encontrou a informacao na base. " +
    "Nunca invente informacao fora do contexto.";
  const withInstructions = instructions ? `${base}\n\nInstrucoes adicionais do assistente: ${instructions}` : base;
  return `${withInstructions}\n\nCONTEXTO:\n${context.join("\n---\n")}`;
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
      return { conversationId, answer: NO_CONTEXT_REPLY, usedContext: false };
    }

    const provider = await resolveProviderForTenant(organizationId, environment);
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(assistant.instructions, retrieval.chunks.map((c) => c.content)) },
      { role: "user", content: question },
    ];

    const reply = await provider.chat(messages, assistant.model_id);
    await conversationsService.addAssistantMessage(conversationId, reply);

    return { conversationId, answer: reply, usedContext: true };
  },
};
