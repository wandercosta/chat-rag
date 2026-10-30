import { db } from "../../db/client.js";
import type { AssistantStatus, WidgetSettings } from "../../db/types.js";

export interface NewAssistantInput {
  organizationId: string;
  name: string;
  modelId: string;
  instructions: string | null;
}

export interface AssistantUpdateInput {
  name?: string;
  status?: AssistantStatus;
  modelId?: string;
  instructions?: string | null;
  retentionDays?: number | null;
  widgetSettings?: WidgetSettings;
  humanInboxEnabled?: boolean;
}

export const assistantsRepository = {
  listForOrganization(organizationId: string) {
    return db
      .selectFrom("assistants")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("updated_at", "desc")
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("assistants")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  insert(input: NewAssistantInput) {
    return db
      .insertInto("assistants")
      .values({
        organization_id: input.organizationId,
        name: input.name,
        model_id: input.modelId,
        instructions: input.instructions,
        status: "rascunho",
        response_mode: "estrita",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(organizationId: string, id: string, input: AssistantUpdateInput) {
    return db
      .updateTable("assistants")
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.modelId !== undefined && { model_id: input.modelId }),
        ...(input.instructions !== undefined && { instructions: input.instructions }),
        ...(input.retentionDays !== undefined && { retention_days: input.retentionDays }),
        ...(input.widgetSettings !== undefined && {
          widget_settings: JSON.stringify(input.widgetSettings),
        }),
        ...(input.humanInboxEnabled !== undefined && {
          human_inbox_enabled: input.humanInboxEnabled,
        }),
        updated_at: new Date().toISOString(),
      })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  },

  /** Lista global (todos os tenants) para o job de retencao — o unico
   * consumidor legitimo que precisa varrer alem de uma organizacao por vez. */
  listAll() {
    return db
      .selectFrom("assistants")
      .select(["id", "organization_id", "retention_days"])
      .execute();
  },
};
