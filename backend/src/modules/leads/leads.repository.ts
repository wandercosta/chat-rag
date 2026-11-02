import { db } from "../../db/client.js";
import type { LeadInsightStatus } from "../../db/types.js";
import type { Classification } from "./classifier.js";

const columns = [
  "id",
  "contact_id",
  "temperature",
  "confidence",
  "interest",
  "next_step",
  "summary",
  "model",
  "status",
  "created_by",
  "created_at",
  "reviewed_by",
  "reviewed_at",
] as const;

export type InsightRow = Awaited<ReturnType<typeof leadsRepository.findInsight>> & object;

export const leadsRepository = {
  async isEnabled(organizationId: string) {
    const row = await db
      .selectFrom("lead_settings")
      .select("enabled")
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();
    return row?.enabled ?? false;
  },

  setEnabled(organizationId: string, enabled: boolean, userId: string) {
    return db
      .insertInto("lead_settings")
      .values({ organization_id: organizationId, enabled, updated_by: userId })
      .onConflict((oc) =>
        oc
          .column("organization_id")
          .doUpdateSet({ enabled, updated_by: userId, updated_at: new Date() }),
      )
      .execute();
  },

  insertInsight(
    organizationId: string,
    contactId: string,
    result: Classification,
    model: string | null,
    userId: string,
  ) {
    return db
      .insertInto("lead_insights")
      .values({
        organization_id: organizationId,
        contact_id: contactId,
        temperature: result.temperatura,
        confidence: result.confianca,
        interest: result.interesse,
        next_step: result.proximo_passo,
        summary: result.resumo,
        model,
        created_by: userId,
      })
      .returning(columns)
      .executeTakeFirstOrThrow();
  },

  /** Sugestao nova substitui a pendente: so uma por contato espera revisao. */
  supersedePending(organizationId: string, contactId: string, userId: string) {
    return db
      .updateTable("lead_insights")
      .set({ status: "descartada", reviewed_by: userId, reviewed_at: new Date() })
      .where("organization_id", "=", organizationId)
      .where("contact_id", "=", contactId)
      .where("status", "=", "sugerida")
      .execute();
  },

  findInsight(organizationId: string, id: string) {
    return db
      .selectFrom("lead_insights")
      .select(columns)
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  listForContact(organizationId: string, contactId: string) {
    return db
      .selectFrom("lead_insights")
      .select(columns)
      .where("organization_id", "=", organizationId)
      .where("contact_id", "=", contactId)
      .orderBy("created_at", "desc")
      .limit(20)
      .execute();
  },

  /** Ultima classificacao aceita (pela hora do aceite) de cada contato pedido. */
  currentFor(organizationId: string, contactIds: string[]) {
    if (contactIds.length === 0) return Promise.resolve([]);
    return db
      .selectFrom("lead_insights")
      .distinctOn("contact_id")
      .select(["contact_id", "temperature", "confidence", "reviewed_at"])
      .where("organization_id", "=", organizationId)
      .where("contact_id", "in", contactIds)
      .where("status", "=", "aceita")
      .orderBy("contact_id")
      .orderBy("reviewed_at", "desc")
      .execute();
  },

  review(organizationId: string, id: string, status: LeadInsightStatus, userId: string) {
    return db
      .updateTable("lead_insights")
      .set({ status, reviewed_by: userId, reviewed_at: new Date() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .where("status", "=", "sugerida")
      .executeTakeFirst();
  },

  async deleteOlderThan(organizationId: string, cutoff: Date) {
    const result = await db
      .deleteFrom("lead_insights")
      .where("organization_id", "=", organizationId)
      .where("created_at", "<", cutoff)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  },

  organizationsWithInsights() {
    return db
      .selectFrom("lead_insights")
      .select("organization_id")
      .distinct()
      .execute()
      .then((rows) => rows.map((r) => r.organization_id));
  },

  exportAll(organizationId: string) {
    return db
      .selectFrom("lead_insights")
      .select(columns)
      .where("organization_id", "=", organizationId)
      .execute();
  },
};
