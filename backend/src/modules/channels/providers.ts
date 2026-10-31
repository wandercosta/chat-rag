import {
  decryptSecret,
  deserializeEnvelope,
  type SerializedEnvelope,
} from "../../crypto/envelope.js";
import type { ChannelProvider } from "../../db/types.js";
import { metaMessagingClient, parseMessagingWebhook } from "./meta-messaging.js";
import { parseTelegramUpdate, telegramClient, verifySecretToken } from "./telegram.js";
import { whatsappClient } from "./whatsapp.client.js";
import { parseWhatsAppWebhook, verifySignature, type ParsedWebhook } from "./whatsapp.webhook.js";

/**
 * Segredos de uma conexao, cifrados juntos num envelope (ADR-006 #7).
 * `accessToken` e o token do numero (WhatsApp), da Pagina (Messenger e
 * Instagram) ou do bot (Telegram). `appSecret` assina os webhooks da Meta;
 * `webhookSecret` e o texto que o Telegram devolve no cabecalho.
 */
export interface ChannelSecrets {
  accessToken: string;
  appSecret?: string;
  webhookSecret?: string;
}

export interface ConnectionForProvider {
  external_id: string;
  config: Record<string, string>;
  secret: SerializedEnvelope;
}

/** Segredos so existem decifrados dentro do processo, na hora do uso. */
export function secretsOf(connection: Pick<ConnectionForProvider, "secret">): ChannelSecrets {
  return JSON.parse(decryptSecret(deserializeEnvelope(connection.secret)));
}

export interface ProviderAdapter {
  /** Confere que o webhook veio do provedor (assinatura ou token secreto). */
  authenticate(headers: Record<string, unknown>, raw: Buffer, secrets: ChannelSecrets): boolean;
  /** Mensagens e recibos so da propria conta da conexao. */
  parse(payload: unknown, connection: ConnectionForProvider): ParsedWebhook;
  sendText(
    connection: ConnectionForProvider,
    to: string,
    text: string,
    options?: { humanAgent?: boolean },
  ): Promise<string | null>;
  /** Nome pela API do provedor, quando o webhook nao traz (Messenger e Instagram). */
  lookupName?(connection: ConnectionForProvider, from: string): Promise<string | null>;
  /** Telefone do remetente, quando o canal o revela (so o WhatsApp). */
  phoneFrom(from: string): string | null;
}

const metaSignature: ProviderAdapter["authenticate"] = (headers, raw, secrets) =>
  !!secrets.appSecret &&
  verifySignature(raw, headers["x-hub-signature-256"] as string | undefined, secrets.appSecret);

export const providers: Record<ChannelProvider, ProviderAdapter> = {
  whatsapp: {
    authenticate: metaSignature,
    parse: (payload, connection) => parseWhatsAppWebhook(payload, connection.external_id),
    sendText: (connection, to, text) =>
      whatsappClient.sendText(connection.external_id, secretsOf(connection).accessToken, to, text),
    phoneFrom: (from) => `+${from}`,
  },
  messenger: {
    authenticate: metaSignature,
    parse: (payload, connection) => parseMessagingWebhook(payload, connection.external_id),
    sendText: (connection, to, text, options) =>
      metaMessagingClient.sendText(
        connection.external_id,
        secretsOf(connection).accessToken,
        to,
        text,
        options,
      ),
    lookupName: (connection, from) =>
      metaMessagingClient.profileName("messenger", from, secretsOf(connection).accessToken),
    phoneFrom: () => null,
  },
  instagram: {
    authenticate: metaSignature,
    parse: (payload, connection) => parseMessagingWebhook(payload, connection.external_id),
    // A resposta sai pela Pagina ligada a conta profissional do Instagram.
    sendText: (connection, to, text, options) =>
      metaMessagingClient.sendText(
        connection.config.pageId ?? connection.external_id,
        secretsOf(connection).accessToken,
        to,
        text,
        options,
      ),
    lookupName: (connection, from) =>
      metaMessagingClient.profileName("instagram", from, secretsOf(connection).accessToken),
    phoneFrom: () => null,
  },
  telegram: {
    authenticate: (headers, _raw, secrets) =>
      !!secrets.webhookSecret &&
      verifySecretToken(
        headers["x-telegram-bot-api-secret-token"] as string | undefined,
        secrets.webhookSecret,
      ),
    parse: (payload) => parseTelegramUpdate(payload),
    sendText: (connection, to, text) =>
      telegramClient.sendText(secretsOf(connection).accessToken, to, text),
    phoneFrom: () => null,
  },
};
