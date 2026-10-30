import { embeddingProviderName } from "../../config/ai.js";
import { env } from "../../config/env.js";
import { aiCredentialsService } from "../organizations/index.js";
import { createAnthropicChat } from "./anthropic-adapter.js";
import { createHashEmbeddings, createLocalEmbeddings } from "./local-embeddings.js";
import { createOpenAiChat, createOpenAiEmbeddings } from "./openai-adapter.js";
import type { ChatProvider, EmbeddingProvider } from "./provider.types.js";

export class NoActiveCredentialError extends Error {}

type Environment = "teste" | "producao";

function platformChat(): ChatProvider | null {
  switch (env.AI_PROVIDER) {
    case "openai":
      return env.OPENAI_API_KEY
        ? createOpenAiChat(env.OPENAI_API_KEY, env.OPENAI_CHAT_MODEL)
        : null;
    case "anthropic":
      return env.ANTHROPIC_API_KEY
        ? createAnthropicChat(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL)
        : null;
    case "local":
      return { kind: "extractive", chat: async () => "" };
  }
}

/** A chave BYOK do tenant e da OpenAI; so serve para modelos dela. */
function isOpenAiModel(modelId: string): boolean {
  return /^(gpt-|o\d)/.test(modelId);
}

/**
 * Chat: a chave BYOK do tenant (OpenAI, cadastrada no painel) tem prioridade
 * quando o assistente usa um modelo da OpenAI. Sem ela, vale o provedor da
 * plataforma definido no .env (ADR-005).
 */
export async function resolveChatProvider(
  organizationId: string,
  environment: Environment,
  modelId: string,
): Promise<ChatProvider> {
  if (isOpenAiModel(modelId)) {
    const tenantKey = await aiCredentialsService.resolveActiveKey(organizationId, environment);
    if (tenantKey) return createOpenAiChat(tenantKey);
  }

  const platform = platformChat();
  if (!platform) throw new NoActiveCredentialError();
  return platform;
}

let localEmbeddings: EmbeddingProvider | null = null;

/**
 * Embeddings sao do deploy, nao do tenant: misturar vetores de modelos
 * diferentes na mesma coluna tornaria a busca sem sentido. Com OpenAI, a
 * chamada usa a chave da plataforma ou, na falta dela, a do tenant.
 */
export async function resolveEmbeddingProvider(organizationId: string): Promise<EmbeddingProvider> {
  const name = embeddingProviderName();
  if (name === "hash") return createHashEmbeddings();
  if (name === "local") {
    localEmbeddings ??= createLocalEmbeddings(env.LOCAL_EMBEDDING_MODEL);
    return localEmbeddings;
  }

  const key =
    env.OPENAI_API_KEY ??
    (await aiCredentialsService.resolveActiveKey(organizationId, "producao")) ??
    (await aiCredentialsService.resolveActiveKey(organizationId, "teste"));
  if (!key) throw new NoActiveCredentialError();
  return createOpenAiEmbeddings(key);
}
