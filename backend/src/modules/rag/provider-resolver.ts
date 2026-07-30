import { aiCredentialsService } from "../organizations/index.js";
import { createOpenAiAdapter } from "./openai-adapter.js";
import type { ProviderAdapter } from "./provider.types.js";

export class NoActiveCredentialError extends Error {}

/** Resolve o adapter do provedor usando a chave BYOK do tenant (nunca uma
 * chave da plataforma). Lanca erro se nao houver credencial valida. */
export async function resolveProviderForTenant(
  organizationId: string,
  environment: "teste" | "producao",
): Promise<ProviderAdapter> {
  const apiKey = await aiCredentialsService.resolveActiveKey(organizationId, environment);
  if (!apiKey) throw new NoActiveCredentialError();
  return createOpenAiAdapter(apiKey);
}

/** Para operacoes internas (ex.: indexacao) onde qualquer ambiente valido serve. */
export async function resolveAnyProviderForTenant(organizationId: string): Promise<ProviderAdapter> {
  const producao = await aiCredentialsService.resolveActiveKey(organizationId, "producao");
  if (producao) return createOpenAiAdapter(producao);

  const teste = await aiCredentialsService.resolveActiveKey(organizationId, "teste");
  if (teste) return createOpenAiAdapter(teste);

  throw new NoActiveCredentialError();
}
