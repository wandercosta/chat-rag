import crypto from "node:crypto";
import { assistantsService } from "../assistants/index.js";
import { auditService } from "../audit/index.js";
import { encryptSecret, maskSecret, serializeEnvelope } from "../../crypto/envelope.js";
import { recheckAccount, verifyAccount, type NewConnectionInput } from "./connect.js";
import { connectionsRepository, templatesRepository } from "./connections.repository.js";
import { ChannelApiError } from "./http.js";
import { secretsOf } from "./providers.js";
import { telegramClient } from "./telegram.js";
import { whatsappClient } from "./whatsapp.client.js";

export class AssistantNotFoundError extends Error {}
export class ConnectionNotFoundError extends Error {}
export class DuplicateConnectionError extends Error {}
/** O provedor recusou as credenciais: a mensagem dele vai para o painel. */
export class ConnectionCheckError extends Error {}

export { secretsOf };
export type { NewConnectionInput };

const PROVIDER_LABEL = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  telegram: "Telegram",
} as const;

/** Corpo do modelo e quantas variaveis ({{1}}, {{2}}...) ele pede. */
function templateBody(components: { type: string; text?: string }[] = []) {
  const body = components.find((c) => c.type === "BODY")?.text ?? "";
  const numbers = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return { body, variables: numbers.length ? Math.max(...numbers) : 0 };
}

function reason(err: unknown) {
  return err instanceof ChannelApiError ? err.message : "erro desconhecido";
}

/** O Telegram nao tem tela para colar a URL: o webhook e registrado pela API. */
async function registerTelegramWebhook(
  id: string,
  token: string,
  webhookSecret: string,
  webhookUrl: string,
) {
  try {
    await telegramClient.setWebhook(token, webhookUrl, webhookSecret);
    await connectionsRepository.setStatus(id, "ativo", null);
    return { status: "ativo" as const, detail: null };
  } catch (err) {
    const detail = `webhook nao registrado no Telegram: ${reason(err)}`;
    await connectionsRepository.setStatus(id, "erro", detail);
    return { status: "erro" as const, detail };
  }
}

export const connectionsService = {
  list(organizationId: string) {
    return connectionsRepository.list(organizationId);
  },

  /**
   * Conecta uma conta do proprio tenant (ADR-006 #7): confere as credenciais no
   * provedor, guarda os segredos cifrados e mostra so o final do token.
   */
  async create(
    actorUserId: string,
    organizationId: string,
    input: NewConnectionInput,
    webhookUrlFor: (connectionId: string) => string,
  ) {
    if (!(await assistantsService.get(organizationId, input.assistantId))) {
      throw new AssistantNotFoundError();
    }

    let account;
    try {
      account = await verifyAccount(input);
    } catch (err) {
      throw new ConnectionCheckError(reason(err));
    }
    if (await connectionsRepository.existsExternal(account.provider, account.externalId)) {
      throw new DuplicateConnectionError();
    }

    let connection = await connectionsRepository.insert({
      organizationId,
      assistantId: input.assistantId,
      provider: account.provider,
      name: input.name,
      externalId: account.externalId,
      config: account.config,
      secret: serializeEnvelope(encryptSecret(JSON.stringify(account.secrets))),
      secretHint: maskSecret(account.secrets.accessToken),
      verifyToken: crypto.randomBytes(18).toString("hex"),
    });

    if (account.provider === "telegram") {
      const result = await registerTelegramWebhook(
        connection.id,
        account.secrets.accessToken,
        account.secrets.webhookSecret!,
        webhookUrlFor(connection.id),
      );
      connection = { ...connection, status: result.status, status_detail: result.detail };
    }

    await auditService.record({
      actorUserId,
      organizationId,
      action: `Conectou canal ${PROVIDER_LABEL[account.provider]}`,
      type: "seguranca",
      target: `${input.name} · ${account.label}`,
    });
    return connection;
  },

  /** Testa de novo as credenciais (e, no Telegram, registra o webhook outra vez). */
  async check(organizationId: string, id: string, webhookUrlFor: (id: string) => string) {
    const connection = await connectionsRepository.findById(organizationId, id);
    if (!connection) throw new ConnectionNotFoundError();
    const secrets = secretsOf(connection);
    try {
      await recheckAccount(connection.provider, connection.external_id, connection.config, secrets);
    } catch (err) {
      const detail = reason(err);
      await connectionsRepository.setStatus(id, "erro", detail);
      return { status: "erro" as const, detail };
    }
    if (connection.provider === "telegram") {
      return registerTelegramWebhook(
        id,
        secrets.accessToken,
        secrets.webhookSecret ?? "",
        webhookUrlFor(id),
      );
    }
    await connectionsRepository.setStatus(id, "ativo", null);
    return { status: "ativo" as const, detail: null };
  },

  async remove(actorUserId: string, organizationId: string, id: string) {
    const connection = await connectionsRepository.findById(organizationId, id);
    if (!connection) throw new ConnectionNotFoundError();
    if (connection.provider === "telegram") {
      // Melhor esforco: sem isso o Telegram continua tentando entregar.
      await telegramClient.deleteWebhook(secretsOf(connection).accessToken).catch(() => {});
    }
    await connectionsRepository.remove(organizationId, id);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Desconectou canal",
      type: "seguranca",
      target: `${connection.provider} · ${connection.name}`,
    });
  },

  listTemplates(organizationId: string, connectionId: string) {
    return templatesRepository.list(organizationId, connectionId);
  },

  /** Modelos so existem no WhatsApp: puxa da Meta os da conta (WABA). */
  async syncTemplates(actorUserId: string, organizationId: string, id: string) {
    const connection = await connectionsRepository.findById(organizationId, id);
    if (!connection || connection.provider !== "whatsapp") throw new ConnectionNotFoundError();
    let templates;
    try {
      templates = await whatsappClient.listTemplates(
        connection.config.wabaId ?? "",
        secretsOf(connection).accessToken,
      );
    } catch (err) {
      throw new ConnectionCheckError(reason(err));
    }
    await templatesRepository.replaceAll(
      organizationId,
      id,
      templates.map((t) => ({
        name: t.name,
        language: t.language,
        category: t.category ?? null,
        status: t.status,
        ...templateBody(t.components),
      })),
    );
    await auditService.record({
      actorUserId,
      organizationId,
      action: `Sincronizou ${templates.length} modelo(s) do WhatsApp`,
      type: "configuracao",
      target: connection.name,
    });
    return templatesRepository.list(organizationId, id);
  },
};
