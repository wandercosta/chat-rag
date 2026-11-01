import type { AttachmentKind } from "../../db/types.js";
import {
  deleteObjects,
  getSourceFile,
  mediaObjectKey,
  putSourceFile,
} from "../../storage/objects.js";
import { attachmentsRepository } from "./attachments.repository.js";
import { signedMediaPath, verifyMediaLink } from "./media-link.js";

/** Validade do link publico de um arquivo enviado (widget e Instagram). */
export const MEDIA_LINK_TTL_SECONDS = 24 * 60 * 60;

/**
 * Midia recebida pelos canais e arquivos enviados por atendente. O modulo de
 * canais baixa o arquivo do provedor e entrega os bytes aqui; o painel so ve o arquivo pela rota da conversa,
 * com as mesmas permissoes de leitura dela.
 */
export const attachmentsService = {
  register(
    organizationId: string,
    messageId: string,
    kind: AttachmentKind,
    fileName: string | null,
  ) {
    return attachmentsRepository.create(organizationId, messageId, kind, fileName);
  },

  async saveFile(organizationId: string, attachmentId: string, data: Buffer, mimeType: string) {
    const storageKey = mediaObjectKey(organizationId, attachmentId);
    await putSourceFile(storageKey, data, mimeType);
    await attachmentsRepository.finish(attachmentId, {
      status: "pronto",
      storageKey,
      mimeType,
      sizeBytes: data.length,
    });
  },

  /** Arquivo enviado por atendente: grava no storage e ja fica pronto. */
  async storeOutbound(
    organizationId: string,
    messageId: string,
    file: { kind: AttachmentKind; fileName: string; mimeType: string; data: Buffer },
  ) {
    const { id } = await attachmentsRepository.create(
      organizationId,
      messageId,
      file.kind,
      file.fileName,
    );
    await this.saveFile(organizationId, id, file.data, file.mimeType);
    return { id, kind: file.kind, fileName: file.fileName, mimeType: file.mimeType };
  },

  /** Caminho (relativo a API) do link publico temporario do arquivo enviado. */
  linkPath(attachmentId: string, ttlSeconds = MEDIA_LINK_TTL_SECONDS) {
    return signedMediaPath(attachmentId, ttlSeconds);
  },

  /** Rota publica: so com assinatura valida e so arquivo de atendente. */
  async openByLink(attachmentId: string, exp: number, sig: string) {
    if (!verifyMediaLink(attachmentId, exp, sig)) return null;
    const attachment = await attachmentsRepository.findOutbound(attachmentId);
    if (!attachment?.storage_key || attachment.status !== "pronto") return null;
    return {
      data: await getSourceFile(attachment.storage_key),
      mimeType: attachment.mime_type ?? "application/octet-stream",
      fileName: attachment.file_name ?? `${attachment.kind}-${attachment.id}`,
    };
  },

  /** Arquivo da mensagem para mandar ao canal (bytes lidos so quando precisa). */
  async forDelivery(messageId: string) {
    const attachment = await attachmentsRepository.findReadyForMessage(messageId);
    if (!attachment?.storage_key) return null;
    const key = attachment.storage_key;
    return {
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mime_type ?? "application/octet-stream",
      fileName: attachment.file_name ?? `${attachment.kind}-${attachment.id}`,
      read: () => getSourceFile(key),
    };
  },

  markFailed(attachmentId: string, error: string) {
    return attachmentsRepository.finish(attachmentId, { status: "falhou", error });
  },

  listForMessages(messageIds: string[]) {
    return attachmentsRepository.listForMessages(messageIds);
  },

  async open(organizationId: string, conversationId: string, attachmentId: string) {
    const attachment = await attachmentsRepository.findForConversation(
      organizationId,
      conversationId,
      attachmentId,
    );
    if (!attachment?.storage_key || attachment.status !== "pronto") return null;
    return {
      data: await getSourceFile(attachment.storage_key),
      mimeType: attachment.mime_type ?? "application/octet-stream",
      fileName: attachment.file_name ?? `${attachment.kind}-${attachment.id}`,
    };
  },

  /** Anonimizacao: a conversa fica, os anexos (linhas e arquivos) saem. */
  async removeForConversations(conversationIds: string[]) {
    const keys = await attachmentsRepository.removeForConversations(conversationIds);
    if (keys.length > 0) await deleteObjects(keys);
  },

  /** Antes de apagar as conversas: as linhas saem em cascata, o arquivo nao. */
  async deleteFilesFor(
    where: { assistantId: string; before: Date } | { organizationId: string; contactId: string },
  ) {
    const keys = await attachmentsRepository.keysFor(where);
    if (keys.length > 0) await deleteObjects(keys);
  },
};
