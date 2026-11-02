import type { ConversationChannel } from "../../db/types.js";
import { platformStatsRepository } from "./platform-stats.repository.js";

export interface OrganizationActivity {
  organizationId: string;
  conversations: number;
  messagesReceived: number;
  assistantReplies: number;
  agentReplies: number;
}

/** Atividade de atendimento de toda a plataforma (visao do Master, so contagens). */
export const platformStatsService = {
  async activitySince(since: Date) {
    const [conversations, messages, byChannel, perDay] = await Promise.all([
      platformStatsRepository.conversationsByOrganization(since),
      platformStatsRepository.messagesByOrganization(since),
      platformStatsRepository.conversationsByChannel(since),
      platformStatsRepository.receivedPerDay(since),
    ]);

    const byOrg = new Map<string, OrganizationActivity>();
    const entry = (organizationId: string) => {
      let row = byOrg.get(organizationId);
      if (!row) {
        row = {
          organizationId,
          conversations: 0,
          messagesReceived: 0,
          assistantReplies: 0,
          agentReplies: 0,
        };
        byOrg.set(organizationId, row);
      }
      return row;
    };
    for (const r of conversations) entry(r.organization_id).conversations = Number(r.count);
    for (const r of messages) {
      const row = entry(r.organization_id);
      row.messagesReceived = Number(r.received);
      row.assistantReplies = Number(r.assistant);
      row.agentReplies = Number(r.agent);
    }

    return {
      organizations: [...byOrg.values()],
      conversationsByChannel: Object.fromEntries(
        byChannel.map((r) => [r.channel, Number(r.count)]),
      ) as Partial<Record<ConversationChannel, number>>,
      messagesReceivedPerDay: perDay.map((r) => ({ day: r.day, count: Number(r.count) })),
    };
  },
};
