import { db } from "../../db/client.js";
import type { AttachmentKind, AttachmentStatus } from "../../db/types.js";

const PUBLIC_COLUMNS = [
  "id",
  "message_id",
  "kind",
  "mime_type",
  "file_name",
  "size_bytes",
  "status",
  "error",
] as const;

/** Anexos de mensagens recebidas pelos canais (arquivo no storage). */
export const attachmentsRepository = {
  create(organizationId: string, messageId: string, kind: AttachmentKind, fileName: string | null) {
    return db
      .insertInto("message_attachments")
      .values({
        organization_id: organizationId,
        message_id: messageId,
        kind,
        file_name: fileName,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();
  },

  async finish(
    id: string,
    values: {
      status: AttachmentStatus;
      storageKey?: string;
      mimeType?: string | null;
      sizeBytes?: number;
      error?: string | null;
    },
  ) {
    await db
      .updateTable("message_attachments")
      .set({
        status: values.status,
        storage_key: values.storageKey ?? null,
        mime_type: values.mimeType ?? null,
        size_bytes: values.sizeBytes ?? null,
        error: values.error ?? null,
      })
      .where("id", "=", id)
      .execute();
  },

  /** Sem a chave do storage: e o que o painel ve. */
  listForMessages(messageIds: string[]) {
    if (messageIds.length === 0) return Promise.resolve([]);
    return db
      .selectFrom("message_attachments")
      .select(PUBLIC_COLUMNS)
      .where("message_id", "in", messageIds)
      .orderBy("created_at")
      .execute();
  },

  /** Arquivo de uma conversa desta organizacao (para o download no painel). */
  findForConversation(organizationId: string, conversationId: string, attachmentId: string) {
    return db
      .selectFrom("message_attachments as a")
      .innerJoin("messages as m", "m.id", "a.message_id")
      .select(["a.id", "a.mime_type", "a.file_name", "a.kind", "a.status", "a.storage_key"])
      .where("a.organization_id", "=", organizationId)
      .where("m.conversation_id", "=", conversationId)
      .where("a.id", "=", attachmentId)
      .executeTakeFirst();
  },

  /** Anonimizacao: apaga as linhas e devolve as chaves para apagar o arquivo. */
  async removeForConversations(conversationIds: string[]) {
    if (conversationIds.length === 0) return [];
    const rows = await db
      .deleteFrom("message_attachments")
      .where("message_id", "in", (eb) =>
        eb.selectFrom("messages").select("id").where("conversation_id", "in", conversationIds),
      )
      .returning("storage_key")
      .execute();
    return rows.flatMap((r) => (r.storage_key ? [r.storage_key] : []));
  },

  /** Chaves no storage das conversas que vao ser apagadas. */
  async keysFor(
    where:
      | { assistantId: string; before: Date }
      | {
          organizationId: string;
          contactId: string;
        },
  ) {
    let query = db
      .selectFrom("message_attachments as a")
      .innerJoin("messages as m", "m.id", "a.message_id")
      .innerJoin("conversations as c", "c.id", "m.conversation_id")
      .select("a.storage_key")
      .where("a.storage_key", "is not", null);
    query =
      "assistantId" in where
        ? query
            .where("c.assistant_id", "=", where.assistantId)
            .where("c.started_at", "<", where.before)
        : query
            .where("c.organization_id", "=", where.organizationId)
            .where("c.contact_id", "=", where.contactId);
    const rows = await query.execute();
    return rows.map((r) => r.storage_key!);
  },
};
