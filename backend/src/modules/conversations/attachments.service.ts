import type { AttachmentKind } from "../../db/types.js";
import {
  deleteObjects,
  getSourceFile,
  mediaObjectKey,
  putSourceFile,
} from "../../storage/objects.js";
import { attachmentsRepository } from "./attachments.repository.js";

/**
 * Midia recebida pelos canais. O modulo de canais baixa o arquivo do provedor
 * e entrega os bytes aqui; o painel so ve o arquivo pela rota da conversa,
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
