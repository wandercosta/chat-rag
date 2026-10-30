import { env } from "../../config/env.js";
import { attachmentsService, conversationsService } from "../conversations/index.js";
import { inboxService } from "../inbox/index.js";
import type { ChannelProvider } from "../../db/types.js";
import type { InboundMedia, InboundMessage } from "../../queue/channel-messages.queue.js";
import { ChannelApiError, downloadBinary } from "./http.js";
import { secretsOf, type ConnectionForProvider } from "./providers.js";
import { telegramClient } from "./telegram.js";
import { whatsappClient } from "./whatsapp.client.js";

type Connection = ConnectionForProvider & { provider: ChannelProvider };

/**
 * No Messenger e no Instagram a URL vem dentro do webhook, que o tenant
 * assina com o proprio app: so CDN da Meta, para o worker nao virar ponte
 * para a rede interna. Vale tambem o host da Graph configurada (a propria
 * Meta em producao; a API simulada nos testes).
 */
const META_CDN = /(^|\.)(fbcdn\.net|fbsbx\.com|cdninstagram\.com)$/;

function assertMetaCdn(raw: string) {
  const url = new URL(raw);
  const graphHost = new URL(env.META_GRAPH_URL).host;
  if (url.protocol === "https:" && META_CDN.test(url.hostname)) return;
  if (url.host === graphHost) return;
  throw new ChannelApiError(400, "o arquivo nao vem do CDN da Meta");
}

/** Onde baixar o arquivo de cada provedor, e com qual credencial. */
async function locate(
  connection: Connection,
  media: InboundMedia,
): Promise<{ url: string; headers: Record<string, string>; mimeType?: string }> {
  switch (connection.provider) {
    case "whatsapp": {
      const token = secretsOf(connection).accessToken;
      const info = await whatsappClient.mediaInfo(media.ref, token);
      if (!info.url) throw new ChannelApiError(404, "a Meta nao devolveu o arquivo");
      return {
        url: info.url,
        headers: { Authorization: `Bearer ${token}` },
        mimeType: info.mime_type,
      };
    }
    case "telegram":
      return {
        url: await telegramClient.fileUrl(secretsOf(connection).accessToken, media.ref),
        headers: {},
      };
    case "messenger":
    case "instagram":
      assertMetaCdn(media.ref);
      return { url: media.ref, headers: {} };
  }
}

/**
 * Guarda a midia de uma mensagem ja gravada. Cada arquivo vira um anexo
 * "pendente" e depois "pronto" ou "falhou"; uma falha nao derruba o
 * atendimento (a mensagem e a resposta ja seguiram). O erro gravado e o do
 * provedor, nunca a URL (no Telegram ela leva o token).
 */
export async function saveInboundMedia(
  organizationId: string,
  connection: Connection,
  message: InboundMessage,
) {
  if (!message.media?.length) return;
  const stored = await conversationsService.findMessageByProviderId(
    organizationId,
    message.providerMessageId,
  );
  if (!stored) return;

  for (const media of message.media) {
    const attachment = await attachmentsService.register(
      organizationId,
      stored.id,
      media.kind,
      media.fileName ?? null,
    );
    try {
      const source = await locate(connection, media);
      const file = await downloadBinary(source.url, source.headers, env.CHANNEL_MEDIA_MAX_BYTES);
      const mimeType =
        media.mimeType ?? source.mimeType ?? file.mimeType ?? "application/octet-stream";
      await attachmentsService.saveFile(organizationId, attachment.id, file.data, mimeType);
    } catch (err) {
      const reason =
        err instanceof ChannelApiError ? err.message : "nao foi possivel guardar o arquivo";
      await attachmentsService.markFailed(attachment.id, reason);
    }
  }
  await inboxService.touched(organizationId, stored.conversation_id);
}
