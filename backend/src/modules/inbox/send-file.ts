import { env } from "../../config/env.js";
import type { AttachmentKind, ConversationChannel } from "../../db/types.js";
import { auditService } from "../audit/index.js";
import { attachmentsService, conversationsService } from "../conversations/index.js";
import { realtime } from "../../realtime/events.js";
import { enqueueChannelJob } from "../../queue/channel-messages.queue.js";
import { assertWindowOpen, claimForReply, requireReplyable, type InboxActor } from "./reply.js";

/** Tipo de arquivo que o canal nao aceita (Instagram so imagem, video e audio). */
export class UnsupportedFileError extends Error {}

/**
 * Lista fechada do que o atendente envia: formatos que WhatsApp, Telegram e
 * Messenger aceitam. Nada de HTML, SVG ou executavel.
 */
const KIND_BY_MIME: Record<string, AttachmentKind> = {
  "image/jpeg": "imagem",
  "image/png": "imagem",
  "video/mp4": "video",
  "audio/mpeg": "audio",
  "audio/ogg": "audio",
  "audio/mp4": "audio",
  "application/pdf": "documento",
  "text/plain": "documento",
  "text/csv": "documento",
  "application/msword": "documento",
  "application/vnd.ms-excel": "documento",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "documento",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "documento",
};

/** O Instagram so recebe midia por URL e nao aceita documento. */
const INSTAGRAM_KINDS = new Set<AttachmentKind>(["imagem", "video", "audio"]);

const MB = 1024 * 1024;
/**
 * Teto de cada canal por tipo, abaixo do limite geral da plataforma: o que
 * passar daqui o provedor recusaria depois, com a mensagem ja "enviando".
 */
const CHANNEL_MAX_BYTES: Partial<
  Record<ConversationChannel, Partial<Record<AttachmentKind, number>>>
> = {
  whatsapp: { imagem: 5 * MB, video: 16 * MB, audio: 16 * MB, documento: 100 * MB },
  instagram: { imagem: 8 * MB, video: 25 * MB, audio: 25 * MB },
  messenger: { imagem: 25 * MB, video: 25 * MB, audio: 25 * MB, documento: 25 * MB },
  telegram: { imagem: 10 * MB, video: 50 * MB, audio: 50 * MB, documento: 50 * MB },
};

export function outboundKind(mimeType: string, channel: ConversationChannel, sizeBytes = 0) {
  const kind = KIND_BY_MIME[mimeType];
  if (!kind) {
    throw new UnsupportedFileError(
      "tipo de arquivo nao suportado (imagem JPG/PNG, video MP4, audio, PDF, Word, Excel, CSV ou TXT)",
    );
  }
  if (channel === "instagram" && !INSTAGRAM_KINDS.has(kind)) {
    throw new UnsupportedFileError("o Instagram so recebe imagem, video ou audio");
  }
  if (channel === "whatsapp" && mimeType === "text/csv") {
    throw new UnsupportedFileError("o WhatsApp nao aceita CSV; envie como Excel ou PDF");
  }
  const max = CHANNEL_MAX_BYTES[channel]?.[kind];
  if (max && sizeBytes > max) {
    throw new UnsupportedFileError(
      `arquivo grande demais para este canal (ate ${Math.floor(max / MB)} MB para ${kind})`,
    );
  }
  if (channel === "instagram" && !env.PUBLIC_API_URL) {
    throw new UnsupportedFileError(
      "para enviar arquivo pelo Instagram a plataforma precisa de PUBLIC_API_URL",
    );
  }
  return kind;
}

/** Nome sem caminho e com tamanho limitado (vem do navegador de quem envia). */
export function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop()?.trim() ?? "";
  return base.replace(/[\u0000-\u001f]/g, "").slice(0, 120) || "arquivo";
}

/**
 * Arquivo do atendente para o cliente (ADR-006 #3: com responsavel humano).
 * Mesmas regras da resposta em texto: assume a conversa se estiver livre e,
 * no WhatsApp/Messenger/Instagram, so dentro da janela. O texto da mensagem e
 * a legenda (ou o nome do arquivo); canal externo envia pela fila.
 */
export async function sendFile(
  actor: InboxActor,
  organizationId: string,
  conversationId: string,
  file: { data: Buffer; mimeType: string; fileName: string; caption: string | null },
) {
  const conversation = await requireReplyable(organizationId, conversationId);
  const kind = outboundKind(file.mimeType, conversation.channel, file.data.length);
  await assertWindowOpen(conversation);
  await claimForReply(actor, organizationId, conversationId);

  const fileName = safeFileName(file.fileName);
  const { message, attachment } = await attachmentsService.addAgentFile(
    organizationId,
    conversationId,
    file.caption || fileName,
    actor.userId,
    { kind, fileName, mimeType: file.mimeType, data: file.data },
  );

  if (conversation.channel !== "widget") {
    await conversationsService.setDelivery(message.id, { status: "enviando" });
    await enqueueChannelJob({ kind: "outbound", organizationId, messageId: message.id });
  }

  await auditService.record({
    actorUserId: actor.userId,
    organizationId,
    action: "Enviou arquivo na conversa",
    type: "conteudo",
    target: conversationId,
  });
  await realtime.publish(organizationId, { kind: "conversation_changed", conversationId });
  // O widget mostra o arquivo pelo link publico temporario.
  await realtime.publish(organizationId, {
    kind: "agent_message",
    conversationId,
    content: message.content,
    createdAt: new Date(message.created_at).toISOString(),
    attachments: [{ kind, fileName, path: attachmentsService.linkPath(attachment.id) }],
  });
  return { ...message, attachments: [attachment] };
}
