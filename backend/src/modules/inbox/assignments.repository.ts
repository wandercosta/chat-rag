import { db } from "../../db/client.js";
import type { InboxStatus } from "../../db/types.js";

/** Filas da caixa de entrada que vem desta tabela. "assistente" (conversas
 * sem humano) e montada no servico, por exclusao. */
export type AssignmentView = "fila" | "minhas" | "abertas" | "resolvidas";

export const assignmentsRepository = {
  find(organizationId: string, conversationId: string) {
    return db
      .selectFrom("conversation_assignments")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("conversation_id", "=", conversationId)
      .executeTakeFirst();
  },

  list(organizationId: string, view: AssignmentView, userId: string, limit = 100) {
    let query = db
      .selectFrom("conversation_assignments")
      .selectAll()
      .where("organization_id", "=", organizationId);

    if (view === "fila") {
      query = query.where("status", "!=", "resolvida").where("assigned_user_id", "is", null);
    } else if (view === "minhas") {
      query = query.where("status", "!=", "resolvida").where("assigned_user_id", "=", userId);
    } else if (view === "abertas") {
      query = query.where("status", "!=", "resolvida");
    } else {
      query = query.where("status", "=", "resolvida");
    }

    return query.orderBy("updated_at", "desc").limit(limit).execute();
  },

  /** Quais destas conversas estao com humano agora (status nao resolvido). */
  async activeAmong(organizationId: string, conversationIds: string[]): Promise<string[]> {
    if (conversationIds.length === 0) return [];
    const rows = await db
      .selectFrom("conversation_assignments")
      .select("conversation_id")
      .where("organization_id", "=", organizationId)
      .where("conversation_id", "in", conversationIds)
      .where("status", "!=", "resolvida")
      .execute();
    return rows.map((r) => r.conversation_id);
  },

  /** O servico confere antes que a conversa e da organizacao; o `where` no
   * update e a segunda trava, para nunca sobrescrever a linha de outro tenant. */
  upsert(
    organizationId: string,
    conversationId: string,
    values: { status: InboxStatus; assignedUserId: string | null; newRequest?: boolean },
  ) {
    const now = new Date().toISOString();
    return db
      .insertInto("conversation_assignments")
      .values({
        conversation_id: conversationId,
        organization_id: organizationId,
        status: values.status,
        assigned_user_id: values.assignedUserId,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc
          .column("conversation_id")
          .doUpdateSet({
            status: values.status,
            assigned_user_id: values.assignedUserId,
            updated_at: now,
            ...(values.newRequest && { requested_at: now }),
          })
          .where("conversation_assignments.organization_id", "=", organizationId),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
