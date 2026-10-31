import OpenAI from "openai";
import type { ChatProvider, ChatResult, EmbeddingProvider } from "./provider.types.js";

export const EMBEDDING_MODEL = "text-embedding-3-small";

export function createOpenAiChat(apiKey: string, fixedModel?: string): ChatProvider {
  const client = new OpenAI({ apiKey });

  return {
    kind: "llm",
    async chat(messages, model) {
      const response = await client.chat.completions.create({
        model: fixedModel ?? model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.2,
      });
      return {
        text: response.choices[0]?.message?.content ?? "",
        usage: response.usage && {
          model: fixedModel ?? model,
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        },
      };
    },
    async stream(messages, model, onDelta) {
      const stream = await client.chat.completions.create({
        model: fixedModel ?? model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.2,
        stream: true,
        // O ultimo pedaco traz o consumo (sem isso o streaming nao informa tokens).
        stream_options: { include_usage: true },
      });
      let text = "";
      let usage: ChatResult["usage"];
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        if (chunk.usage) {
          usage = {
            model: fixedModel ?? model,
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }
      return { text, usage };
    },
  };
}

export function createOpenAiEmbeddings(apiKey: string): EmbeddingProvider {
  const client = new OpenAI({ apiKey });

  return {
    // Calibrado com text-embedding-3-small (ver retrieval.service.ts).
    relevanceThreshold: 0.65,
    async embed(texts) {
      const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
      return response.data.map((d) => d.embedding);
    },
  };
}
