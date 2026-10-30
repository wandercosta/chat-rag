import { sql } from "kysely";
import { db } from "../../db/client.js";
import type { ConversationChannel, DeliveryStatus, MessageRole } from "../../db/types.js";

/** Ordem do recibo: nunca volta de "lida" para "entregue" se o webhook chegar
 * fora de ordem. "falhou" sempre vale. */
const DELIVERY_RANK: Record<DeliveryStatus, number> = {
  enviando: 0,
  enviada: 1,
  entregue: 2,
  lida: 3,
  falhou: 4,
};
const CURRENT_RANK = sql<number>`case delivery_status when 'enviando' then 0 when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 else 4 end`;

/** Conversas e mensagens de canais (WhatsApp, Telegram...): conversa por
 * conexao + contato, id da mensagem no provedor e recibo de entrega. */
export const channelMessagesRepository = {
  startForChannel(
    organizationId: string,
    assistantId: string,
    channel: ConversationChannel,
    connectionId: string,
    contactId: string,
  ) {
    return db
      .insertInto("conversations")
      .values({
        organization_id: organizationId,
        assistant_id: assistantId,
        channel,
        channel_connection_id: connectionId,
        contact_id: contactId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  findLatestForChannel(organizationId: string, connectionId: string, contactId: string) {
    return db
      .selectFrom("conversations")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("channel_connection_id", "=", connectionId)
      .where("contact_id", "=", contactId)
      .orderBy("started_at", "desc")
      .executeTakeFirst();
  },

  async lastMessageAt(conversationId: string, role?: MessageRole): Promise<Date | null> {
    let query = db
      .selectFrom("messages")
      .select((eb) => eb.fn.max("created_at").as("at"))
      .where("conversation_id", "=", conversationId);
    if (role) query = query.where("role", "=", role);
    const row = await query.executeTakeFirst();
    return row?.at ? new Date(row.at as unknown as string) : null;
  },

  /** Escopado pela organizacao: um tenant controla o proprio app na Meta e
   * poderia assinar um evento citando o id de mensagem de outro tenant. */
  findMessageByProviderId(organizationId: string, providerMessageId: string) {
    return db
      .selectFrom("messages as m")
      .innerJoin("conversations as c", "c.id", "m.conversation_id")
      .select(["m.id", "m.conversation_id"])
      .where("c.organization_id", "=", organizationId)
      .where("m.provider_message_id", "=", providerMessageId)
      .executeTakeFirst();
  },

  async setContent(messageId: string, content: string) {
    await db.updateTable("messages").set({ content }).where("id", "=", messageId).execute();
  },

  /** Mensagem com a conversa dela, conferindo a organizacao. */
  findMessage(organizationId: string, messageId: string) {
    return db
      .selectFrom("messages as m")
      .innerJoin("conversations as c", "c.id", "m.conversation_id")
      .select([
        "m.id",
        "m.role",
        "m.content",
        "m.delivery_status",
        "c.id as conversation_id",
        "c.channel",
        "c.channel_connection_id",
        "c.contact_id",
      ])
      .where("c.organization_id", "=", organizationId)
      .where("m.id", "=", messageId)
      .executeTakeFirst();
  },

  async setDelivery(
    messageId: string,
    values: { providerMessageId?: string; status: DeliveryStatus; error?: string | null },
  ) {
    await db
      .updateTable("messages")
      .set({
        ...(values.providerMessageId && { provider_message_id: values.providerMessageId }),
        delivery_status: values.status,
        delivery_error: values.error ?? null,
      })
      .where("id", "=", messageId)
      .execute();
  },

  /** Recibo do provedor (webhook); devolve a conversa para avisar o painel. */
  updateDeliveryByProviderId(
    organizationId: string,
    providerMessageId: string,
    status: DeliveryStatus,
    error: string | null,
  ) {
    return db
      .updateTable("messages")
      .set({ delivery_status: status, delivery_error: error })
      .where("provider_message_id", "=", providerMessageId)
      .where("conversation_id", "in", (eb) =>
        eb.selectFrom("conversations").select("id").where("organization_id", "=", organizationId),
      )
      .where((eb) =>
        eb.or([
          eb("delivery_status", "is", null),
          status === "falhou"
            ? eb("delivery_status", "!=", "falhou")
            : eb(CURRENT_RANK, "<", DELIVERY_RANK[status]),
        ]),
      )
      .returning("conversation_id")
      .executeTakeFirst();
  },
};
