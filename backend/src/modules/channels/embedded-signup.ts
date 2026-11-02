import { env } from "../../config/env.js";
import { connectionsRepository } from "./connections.repository.js";
import { ConnectionCheckError, connectionsService } from "./connections.service.js";
import { ChannelApiError, requestJson } from "./http.js";
import { graph } from "./whatsapp.client.js";

/**
 * Cadastro integrado da Meta (Embedded Signup) para o WhatsApp: o tenant
 * entra com a conta da Meta numa janela da propria Meta e escolhe o numero;
 * o painel recebe um `code` e os ids do numero e da conta. Aqui o code vira
 * o token da conta (pelo app da plataforma), o app passa a receber os
 * webhooks dessa conta e a conexao nasce como as outras. So existe com o app
 * da plataforma configurado no .env (META_APP_ID, META_APP_SECRET e
 * META_ES_CONFIG_ID); a chave secreta nunca sai do servidor.
 */
export function embeddedSignupConfig() {
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_ES_CONFIG_ID) return null;
  return { appId: env.META_APP_ID, configId: env.META_ES_CONFIG_ID };
}

export class EmbeddedSignupUnavailableError extends Error {}

/** O code vale uma vez e por pouco tempo. A URL leva a chave secreta: nunca logar. */
async function exchangeCode(code: string) {
  const query = new URLSearchParams({
    client_id: env.META_APP_ID!,
    client_secret: env.META_APP_SECRET!,
    code,
  });
  const result = await requestJson<{ access_token?: string }>(
    `${env.META_GRAPH_URL}/oauth/access_token?${query}`,
    { method: "GET" },
    (body) => (body as { error?: { message?: string } }).error?.message,
  );
  if (!result.access_token) throw new ChannelApiError(422, "a Meta nao devolveu o token");
  return result.access_token;
}

export async function connectWithEmbeddedSignup(
  actorUserId: string,
  organizationId: string,
  input: { name: string; assistantId: string; code: string; phoneNumberId: string; wabaId: string },
  webhookUrlFor: (connectionId: string) => string,
) {
  if (!embeddedSignupConfig()) throw new EmbeddedSignupUnavailableError();

  let accessToken: string;
  try {
    accessToken = await exchangeCode(input.code);
  } catch (err) {
    throw new ConnectionCheckError(
      err instanceof ChannelApiError ? err.message : "erro desconhecido",
    );
  }

  // Mesmo caminho da conexao manual (confere o numero, cifra os segredos);
  // a assinatura dos webhooks e a do app da plataforma.
  const connection = await connectionsService.create(
    actorUserId,
    organizationId,
    {
      provider: "whatsapp",
      name: input.name,
      assistantId: input.assistantId,
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      accessToken,
      appSecret: env.META_APP_SECRET!,
    },
    webhookUrlFor,
  );
  const config = { ...connection.config, signup: "embedded" };
  await connectionsRepository.setConfig(organizationId, connection.id, config);

  // O app da plataforma passa a receber as mensagens desta conta.
  try {
    await graph(`/${encodeURIComponent(input.wabaId)}/subscribed_apps`, accessToken, {
      method: "POST",
      body: "{}",
    });
  } catch (err) {
    const detail = `nao foi possivel assinar os webhooks da conta: ${
      err instanceof ChannelApiError ? err.message : "erro desconhecido"
    }`;
    await connectionsRepository.setStatus(connection.id, "erro", detail);
    return { ...connection, config, status: "erro" as const, status_detail: detail };
  }
  return { ...connection, config };
}
