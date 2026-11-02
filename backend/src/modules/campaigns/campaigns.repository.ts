import { db } from "../../db/client.js";
import type { CampaignStatus, ContactFilter, RecipientStatus } from "../../db/types.js";

export interface NewCampaign {
  organizationId: string;
  name: string;
  connectionId: string;
  segmentId: string;
  templateId: string | null;
  templateParams: string[];
  text: string | null;
  ratePerMinute: number;
  createdBy: string;
}

export const campaignsRepository = {
  list(organizationId: string) {
    return db
      .selectFrom("campaigns")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "desc")
      .execute();
  },

  find(organizationId: string, id: string) {
    return db
      .selectFrom("campaigns")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  insert(input: NewCampaign) {
    return db
      .insertInto("campaigns")
      .values({
        organization_id: input.organizationId,
        name: input.name,
        connection_id: input.connectionId,
        segment_id: input.segmentId,
        template_id: input.templateId,
        template_params: JSON.stringify(input.templateParams),
        text: input.text,
        rate_per_minute: input.ratePerMinute,
        created_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async setStatus(
    id: string,
    status: CampaignStatus,
    extra: { scheduledAt?: Date; startedAt?: Date; finishedAt?: Date; filter?: ContactFilter } = {},
  ) {
    await db
      .updateTable("campaigns")
      .set({
        status,
        ...(extra.scheduledAt && { scheduled_at: extra.scheduledAt }),
        ...(extra.startedAt && { started_at: extra.startedAt }),
        ...(extra.finishedAt && { finished_at: extra.finishedAt }),
        ...(extra.filter && { audience_filter: JSON.stringify(extra.filter) }),
      })
      .where("id", "=", id)
      .execute();
  },

  async insertRecipients(
    organizationId: string,
    campaignId: string,
    recipients: { contactId: string; address: string }[],
  ) {
    // Em lotes: um segmento grande nao vira um INSERT gigante.
    for (let i = 0; i < recipients.length; i += 500) {
      await db
        .insertInto("campaign_recipients")
        .values(
          recipients.slice(i, i + 500).map((r) => ({
            organization_id: organizationId,
            campaign_id: campaignId,
            contact_id: r.contactId,
            address: r.address,
          })),
        )
        .onConflict((oc) => oc.columns(["campaign_id", "contact_id"]).doNothing())
        .execute();
    }
  },

  nextPending(campaignId: string, limit: number) {
    return db
      .selectFrom("campaign_recipients")
      .selectAll()
      .where("campaign_id", "=", campaignId)
      .where("status", "=", "pendente")
      .orderBy("id")
      .limit(limit)
      .execute();
  },

  async updateRecipient(
    id: string,
    values: { status: RecipientStatus; messageId?: string | null; error?: string | null },
  ) {
    await db
      .updateTable("campaign_recipients")
      .set({
        status: values.status,
        ...(values.messageId !== undefined && { message_id: values.messageId }),
        error: values.error ?? null,
        ...(values.status === "enviada" && { sent_at: new Date() }),
      })
      .where("id", "=", id)
      .execute();
  },

  async keepMessage(id: string, messageId: string, error: string) {
    await db
      .updateTable("campaign_recipients")
      .set({ message_id: messageId, error })
      .where("id", "=", id)
      .execute();
  },

  /** Contagem por status do destinatario (so a tabela da propria campanha). */
  async statusCounts(campaignId: string) {
    const rows = await db
      .selectFrom("campaign_recipients")
      .select(["status", (eb) => eb.fn.countAll<string>().as("n")])
      .where("campaign_id", "=", campaignId)
      .groupBy("status")
      .execute();
    return new Map(rows.map((r) => [r.status, Number(r.n)]));
  },

  /** Mensagens enviadas pela campanha (para os recibos, no modulo de conversas). */
  async sentMessageIds(campaignId: string) {
    const rows = await db
      .selectFrom("campaign_recipients")
      .select("message_id")
      .where("campaign_id", "=", campaignId)
      .where("status", "=", "enviada")
      .where("message_id", "is not", null)
      .execute();
    return rows.map((r) => r.message_id!);
  },

  recipients(campaignId: string, limit = 200) {
    return db
      .selectFrom("campaign_recipients")
      .select(["id", "contact_id", "status", "error", "sent_at", "message_id"])
      .where("campaign_id", "=", campaignId)
      .orderBy("id")
      .limit(limit)
      .execute();
  },
};
