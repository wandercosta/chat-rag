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

  /**
   * `visibleSectors`: conversas sem setor e as destes setores (fila do
   * Atendente). `sectorId`: so as deste setor (filtro do painel).
   */
  list(
    organizationId: string,
    view: AssignmentView,
    userId: string,
    options: { visibleSectors?: string[]; sectorId?: string; limit?: number } = {},
  ) {
    let query = db
      .selectFrom("conversation_assignments")
      .selectAll()
      .where("organization_id", "=", organizationId);

    const { visibleSectors, sectorId } = options;
    if (visibleSectors) {
      query = query.where((eb) =>
        visibleSectors.length > 0
          ? eb.or([eb("sector_id", "is", null), eb("sector_id", "in", visibleSectors)])
          : eb("sector_id", "is", null),
      );
    }
    if (sectorId) query = query.where("sector_id", "=", sectorId);

    if (view === "fila") {
      query = query.where("status", "!=", "resolvida").where("assigned_user_id", "is", null);
    } else if (view === "minhas") {
      query = query.where("status", "!=", "resolvida").where("assigned_user_id", "=", userId);
    } else if (view === "abertas") {
      query = query.where("status", "!=", "resolvida");
    } else {
      query = query.where("status", "=", "resolvida");
    }

    return query
      .orderBy("updated_at", "desc")
      .limit(options.limit ?? 100)
      .execute();
  },

  /** Pedidos de atendimento e resolucoes do periodo, para as metricas. */
  touchedSince(organizationId: string, since: Date) {
    return db
      .selectFrom("conversation_assignments")
      .select(["conversation_id", "assigned_user_id", "status", "requested_at", "updated_at"])
      .where("organization_id", "=", organizationId)
      .where((eb) => eb.or([eb("requested_at", ">=", since), eb("updated_at", ">=", since)]))
      .execute();
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
    values: {
      status: InboxStatus;
      assignedUserId: string | null;
      newRequest?: boolean;
      /** Sem o campo, o setor fica como esta. */
      sectorId?: string | null;
    },
  ) {
    const now = new Date().toISOString();
    return db
      .insertInto("conversation_assignments")
      .values({
        conversation_id: conversationId,
        organization_id: organizationId,
        status: values.status,
        assigned_user_id: values.assignedUserId,
        sector_id: values.sectorId ?? null,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc
          .column("conversation_id")
          .doUpdateSet({
            status: values.status,
            assigned_user_id: values.assignedUserId,
            updated_at: now,
            ...(values.sectorId !== undefined && { sector_id: values.sectorId }),
            ...(values.newRequest && { requested_at: now }),
          })
          .where("conversation_assignments.organization_id", "=", organizationId),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
