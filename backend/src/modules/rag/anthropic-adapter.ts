import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ChatProvider } from "./provider.types.js";

/** Modelos que aceitam o fallback de recusa do lado do servidor
 * (`fallbacks: "default"`). Nos demais a requisicao vai sem ele. */
const SERVER_FALLBACK_MODELS = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

/** A API da Anthropic recebe o system prompt fora da lista de mensagens, e a
 * lista precisa comecar com o usuario. O historico recortado pode comecar com
 * uma resposta do assistente; ela e descartada aqui. */
export function toAnthropicMessages(messages: ChatMessage[]): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const turns = messages.filter((m) => m.role !== "system");
  const firstUser = turns.findIndex((m) => m.role === "user");
  const conversation = firstUser === -1 ? [] : turns.slice(firstUser);

  return {
    system,
    messages: conversation.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  };
}

/** Texto da resposta; recusa (stop_reason "refusal") vira vazio, que conta como lacuna. */
function textOf(response: Anthropic.Message | Anthropic.Beta.BetaMessage) {
  if (response.stop_reason === "refusal") return "";
  return response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

/**
 * Chat via Claude. O modelo vem do .env (ANTHROPIC_MODEL), nao do assistente:
 * o catalogo de modelos do painel lista modelos da OpenAI.
 */
export function createAnthropicChat(apiKey: string, model: string): ChatProvider {
  const client = new Anthropic({ apiKey });

  const params = (messages: ChatMessage[]) => {
    const { system, messages: turns } = toAnthropicMessages(messages);
    return { model, max_tokens: 4096, system, messages: turns };
  };
  // Resposta curta de atendimento: esforco baixo basta e reduz latencia. O
  // fallback de recusa do lado do servidor roda dentro da mesma chamada.
  const withFallback = (messages: ChatMessage[]) =>
    ({
      ...params(messages),
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    }) as Anthropic.Beta.MessageCreateParamsNonStreaming;

  return {
    kind: "llm",
    async chat(messages) {
      const response = SERVER_FALLBACK_MODELS.has(model)
        ? await client.beta.messages.create(withFallback(messages))
        : await client.messages.create(params(messages));
      return textOf(response);
    },
    /**
     * Mesmo pedido em streaming. Com fallback, o texto do modelo que recusou
     * pode ter saido antes da troca: a resposta final (finalMessage) e a que
     * vale, e quem recebe os pedacos troca pelo texto final no fim.
     */
    async stream(messages, _model, onDelta) {
      if (SERVER_FALLBACK_MODELS.has(model)) {
        const stream = client.beta.messages.stream(withFallback(messages));
        stream.on("text", (delta) => onDelta(delta));
        return textOf(await stream.finalMessage());
      }
      const stream = client.messages.stream(params(messages));
      stream.on("text", (delta) => onDelta(delta));
      return textOf(await stream.finalMessage());
    },
  };
}
