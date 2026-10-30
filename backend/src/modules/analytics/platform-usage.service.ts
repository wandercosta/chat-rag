import { platformStatsService } from "../conversations/index.js";
import { usageRepository } from "./usage.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Consumo agregado da plataforma para o Master: so contagens por organizacao,
 * canal e dia. Nenhum conteudo de conversa nem dado de contato sai daqui, por
 * isso nao exige sessao de suporte (docs/security/privacidade-e-acesso.md).
 * Custo estimado fica de fora ate existir uma tabela de precos por modelo.
 */
export async function platformUsage(days: number) {
  const since = new Date(Date.now() - days * DAY_MS);
  const [activity, eventRows, avgLatency] = await Promise.all([
    platformStatsService.activitySince(since),
    usageRepository.countByOrganizationAndType(since),
    usageRepository.platformAverageRagLatencyMs(since),
  ]);

  const events = new Map<string, { ragQueries: number; noContext: number }>();
  for (const row of eventRows) {
    const current = events.get(row.organization_id) ?? { ragQueries: 0, noContext: 0 };
    if (row.type === "rag_query") current.ragQueries = Number(row.count);
    if (row.type === "no_context") current.noContext = Number(row.count);
    events.set(row.organization_id, current);
  }

  const organizationIds = new Set([
    ...activity.organizations.map((o) => o.organizationId),
    ...events.keys(),
  ]);
  const organizations = [...organizationIds]
    .map((organizationId) => {
      const a = activity.organizations.find((o) => o.organizationId === organizationId);
      return {
        organizationId,
        conversations: a?.conversations ?? 0,
        messagesReceived: a?.messagesReceived ?? 0,
        assistantReplies: a?.assistantReplies ?? 0,
        agentReplies: a?.agentReplies ?? 0,
        ragQueries: events.get(organizationId)?.ragQueries ?? 0,
        noContext: events.get(organizationId)?.noContext ?? 0,
      };
    })
    .sort((x, y) => y.messagesReceived - x.messagesReceived || y.ragQueries - x.ragQueries);

  const sum = (key: keyof (typeof organizations)[number]) =>
    organizations.reduce((total, o) => total + (o[key] as number), 0);

  return {
    days,
    totals: {
      activeOrganizations: organizations.length,
      conversations: sum("conversations"),
      messagesReceived: sum("messagesReceived"),
      assistantReplies: sum("assistantReplies"),
      agentReplies: sum("agentReplies"),
      ragQueries: sum("ragQueries"),
      noContext: sum("noContext"),
      avgRagLatencyMs: avgLatency ? Math.round(Number(avgLatency)) : null,
    },
    conversationsByChannel: activity.conversationsByChannel,
    messagesReceivedPerDay: activity.messagesReceivedPerDay,
    organizations,
  };
}
