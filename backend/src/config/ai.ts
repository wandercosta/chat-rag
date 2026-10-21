import { env } from "./env.js";

/** Sem EMBEDDING_PROVIDER explicito: OpenAI quando ha chave da plataforma,
 * senao o modelo local (o deploy sobe sem nenhuma chave). */
export function embeddingProviderName(): "openai" | "local" | "hash" {
  if (env.EMBEDDING_PROVIDER) return env.EMBEDDING_PROVIDER;
  return env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY ? "openai" : "local";
}

/** A plataforma consegue indexar e responder sem a chave BYOK do tenant?
 * Verdade quando os embeddings nao dependem de chave (local/hash) ou quando
 * ha chave da OpenAI no .env. */
export function platformAiAvailable(): boolean {
  return embeddingProviderName() !== "openai" || !!env.OPENAI_API_KEY;
}

/** Resumo exposto ao painel (nunca inclui chaves). */
export function platformAiSummary() {
  return {
    chatProvider: env.AI_PROVIDER,
    chatModel:
      env.AI_PROVIDER === "openai"
        ? env.OPENAI_CHAT_MODEL
        : env.AI_PROVIDER === "anthropic"
          ? env.ANTHROPIC_MODEL
          : null,
    embeddingProvider: embeddingProviderName(),
    available: platformAiAvailable(),
  };
}
