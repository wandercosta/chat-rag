import { db } from "../../db/client.js";

/** Notas internas: so o painel le. Nunca vao para o widget nem para um evento
 * de tempo real com o conteudo (ADR-006). */
export const notesRepository = {
  listFor(organizationId: string, conversationId: string) {
    return db
      .selectFrom("conversation_notes")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("conversation_id", "=", conversationId)
      .orderBy("created_at", "asc")
      .execute();
  },

  insert(
    organizationId: string,
    conversationId: string,
    authorUserId: string | null,
    content: string,
  ) {
    return db
      .insertInto("conversation_notes")
      .values({
        organization_id: organizationId,
        conversation_id: conversationId,
        author_user_id: authorUserId,
        content,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** Exportacao da organizacao (LGPD). */
  listForOrganization(organizationId: string) {
    return db
      .selectFrom("conversation_notes")
      .select(["conversation_id", "author_user_id", "content", "created_at"])
      .where("organization_id", "=", organizationId)
      .orderBy("created_at")
      .execute();
  },
};
