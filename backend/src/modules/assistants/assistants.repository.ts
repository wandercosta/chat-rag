import { db } from "../../db/client.js";
import type { AssistantStatus } from "../../db/types.js";

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
      .set({ ...input, updated_at: new Date().toISOString() })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  },
};
