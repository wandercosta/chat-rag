import { db } from "../../db/client.js";
import type { RuleInput, Trigger } from "./rules.js";

export const automationsRepository = {
  list(organizationId: string) {
    return db
      .selectFrom("automation_rules")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("created_at")
      .execute();
  },

  find(organizationId: string, id: string) {
    return db
      .selectFrom("automation_rules")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  /** Regras ligadas de um gatilho, na ordem em que foram criadas. */
  enabled(organizationId: string, trigger: Trigger) {
    return db
      .selectFrom("automation_rules")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("trigger", "=", trigger)
      .where("enabled", "=", true)
      .orderBy("created_at")
      .execute();
  },

  /** Organizacoes com alguma regra ligada desse gatilho (varredura). */
  async organizationsWith(trigger: Trigger) {
    const rows = await db
      .selectFrom("automation_rules")
      .select("organization_id")
      .distinct()
      .where("trigger", "=", trigger)
      .where("enabled", "=", true)
      .execute();
    return rows.map((r) => r.organization_id);
  },

  insert(organizationId: string, input: RuleInput, userId: string) {
    return db
      .insertInto("automation_rules")
      .values({
        organization_id: organizationId,
        name: input.name,
        trigger: input.trigger,
        conditions: JSON.stringify(input.conditions),
        actions: JSON.stringify(input.actions),
        updated_by: userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** Editar cria uma versao nova; a execucao registra qual versao rodou. */
  update(organizationId: string, id: string, input: RuleInput, userId: string) {
    return db
      .updateTable("automation_rules")
      .set((eb) => ({
        name: input.name,
        trigger: input.trigger,
        conditions: JSON.stringify(input.conditions),
        actions: JSON.stringify(input.actions),
        version: eb("version", "+", 1),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }))
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  },

  setEnabled(organizationId: string, id: string, enabled: boolean, userId: string) {
    return db
      .updateTable("automation_rules")
      .set({ enabled, updated_by: userId, updated_at: new Date().toISOString() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  },

  async remove(organizationId: string, id: string) {
    const r = await db
      .deleteFrom("automation_rules")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(r.numDeletedRows) > 0;
  },

  async logRun(input: {
    organizationId: string;
    ruleId: string;
    ruleVersion: number;
    conversationId: string | null;
    status: "ok" | "erro";
    detail: string;
  }) {
    await db
      .insertInto("automation_runs")
      .values({
        organization_id: input.organizationId,
        rule_id: input.ruleId,
        rule_version: input.ruleVersion,
        conversation_id: input.conversationId,
        status: input.status,
        detail: input.detail,
      })
      .execute();
  },

  /** Ultima vez que a regra rodou nessa conversa (o "sem resposta" roda uma
   * vez por silencio, nao a cada varredura). */
  async lastRunAt(ruleId: string, conversationId: string) {
    const row = await db
      .selectFrom("automation_runs")
      .select((eb) => eb.fn.max("created_at").as("at"))
      .where("rule_id", "=", ruleId)
      .where("conversation_id", "=", conversationId)
      .executeTakeFirst();
    return row?.at ? new Date(row.at as unknown as string) : null;
  },

  runs(organizationId: string, ruleId: string, limit = 50) {
    return db
      .selectFrom("automation_runs")
      .select(["id", "rule_version", "conversation_id", "status", "detail", "created_at"])
      .where("organization_id", "=", organizationId)
      .where("rule_id", "=", ruleId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();
  },
};
