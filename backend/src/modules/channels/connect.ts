import crypto from "node:crypto";
import type { ChannelProvider } from "../../db/types.js";
import { metaMessagingClient } from "./meta-messaging.js";
import type { ChannelSecrets } from "./providers.js";
import { telegramClient } from "./telegram.js";
import { whatsappClient } from "./whatsapp.client.js";

interface Common {
  name: string;
  assistantId: string;
}

export type NewConnectionInput =
  | (Common & {
      provider: "whatsapp";
      phoneNumberId: string;
      wabaId: string;
      accessToken: string;
      appSecret: string;
    })
  | (Common & { provider: "messenger"; pageId: string; accessToken: string; appSecret: string })
  | (Common & {
      provider: "instagram";
      instagramAccountId: string;
      pageId: string;
      accessToken: string;
      appSecret: string;
    })
  | (Common & { provider: "telegram"; botToken: string });

export interface VerifiedAccount {
  provider: ChannelProvider;
  externalId: string;
  config: Record<string, string>;
  secrets: ChannelSecrets;
  /** Como a conta aparece para quem conecta (numero, Pagina, @usuario). */
  label: string;
}

/**
 * Confere as credenciais no proprio provedor antes de salvar (ADR-006 #7): um
 * token errado falha aqui, com a mensagem do provedor, e nao no primeiro
 * cliente que escrever.
 */
export async function verifyAccount(input: NewConnectionInput): Promise<VerifiedAccount> {
  switch (input.provider) {
    case "whatsapp": {
      const info = await whatsappClient.phoneNumberInfo(input.phoneNumberId, input.accessToken);
      return {
        provider: "whatsapp",
        externalId: input.phoneNumberId,
        config: {
          wabaId: input.wabaId,
          displayPhone: info.display_phone_number ?? "",
          verifiedName: info.verified_name ?? "",
        },
        secrets: { accessToken: input.accessToken, appSecret: input.appSecret },
        label: info.display_phone_number ?? input.phoneNumberId,
      };
    }
    case "messenger": {
      const page = await metaMessagingClient.pageInfo(input.pageId, input.accessToken);
      return {
        provider: "messenger",
        externalId: input.pageId,
        config: { pageName: page.name ?? "" },
        secrets: { accessToken: input.accessToken, appSecret: input.appSecret },
        label: page.name ?? input.pageId,
      };
    }
    case "instagram": {
      const account = await metaMessagingClient.instagramInfo(
        input.instagramAccountId,
        input.accessToken,
      );
      return {
        provider: "instagram",
        externalId: input.instagramAccountId,
        config: { username: account.username ?? "", pageId: input.pageId },
        secrets: { accessToken: input.accessToken, appSecret: input.appSecret },
        label: account.username ? `@${account.username}` : input.instagramAccountId,
      };
    }
    case "telegram": {
      const bot = await telegramClient.getMe(input.botToken);
      return {
        provider: "telegram",
        externalId: String(bot.id),
        config: { username: bot.username ?? "" },
        secrets: {
          accessToken: input.botToken,
          webhookSecret: crypto.randomBytes(24).toString("hex"),
        },
        label: bot.username ? `@${bot.username}` : String(bot.id),
      };
    }
  }
}

/** Testa de novo a conexao ja salva com os segredos guardados. */
export async function recheckAccount(
  provider: ChannelProvider,
  externalId: string,
  config: Record<string, string>,
  secrets: ChannelSecrets,
) {
  switch (provider) {
    case "whatsapp":
      return whatsappClient.phoneNumberInfo(externalId, secrets.accessToken);
    case "messenger":
      return metaMessagingClient.pageInfo(externalId, secrets.accessToken);
    case "instagram":
      return metaMessagingClient.instagramInfo(externalId, secrets.accessToken);
    case "telegram":
      return telegramClient.getMe(secrets.accessToken);
  }
  return config;
}
