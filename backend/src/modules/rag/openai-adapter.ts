import OpenAI from "openai";
import type { ChatMessage, ProviderAdapter } from "./provider.types.js";

export const EMBEDDING_MODEL = "text-embedding-3-small";

export function createOpenAiAdapter(apiKey: string): ProviderAdapter {
  const client = new OpenAI({ apiKey });

  return {
    async embed(texts) {
      const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
      return response.data.map((d) => d.embedding);
    },

    async chat(messages, model) {
      const response = await client.chat.completions.create({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.2,
      });
      return response.choices[0]?.message?.content ?? "";
    },

    async moderate(text) {
      const response = await client.moderations.create({ input: text });
      return response.results[0]?.flagged ?? false;
    },
  };
}
