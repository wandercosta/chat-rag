import { modelCatalogService } from "../assistants/index.js";
import { platformStatsService } from "../conversations/index.js";
import { usageRepository } from "./usage.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Consumo agregado da plataforma para o Master: so contagens por organizacao,
 * canal e dia. Nenhum conteudo de conversa nem dado de contato sai daqui, por
 * isso nao exige sessao de suporte (docs/security/privacidade-e-acesso.md).
 * Custo estimado: tokens de cada resposta (payload do evento) vezes o preco
 * do modelo no catalogo (definido pelo Master). Modelo sem preco nao entra na
 * conta e aparece em `unpricedModels`, para nao fingir um valor.
 */
export async function platformUsage(days: number) {
  const since = new Date(Date.now() - days * DAY_MS);
  const [activity, eventRows, avgLatency, tokenRows, prices] = await Promise.all([
    platformStatsService.activitySince(since),
    usageRepository.countByOrganizationAndType(since),
    usageRepository.platformAverageRagLatencyMs(since),
    usageRepository.tokensByOrganizationAndModel(since),
    modelCatalogService.prices(),
  ]);
  const cost = estimateCost(tokenRows, prices);

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
    ...cost.byOrganization.keys(),
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
        ...(cost.byOrganization.get(organizationId) ?? EMPTY_COST),
      };
    })
    .sort((x, y) => y.messagesReceived - x.messagesReceived || y.ragQueries - x.ragQueries);

  const sum = (key: keyof (typeof organizations)[number]) =>
    organizations.reduce((total, o) => total + (o[key] as number), 0);
  const round = (usd: number) => Math.round(usd * 10_000) / 10_000;

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
      inputTokens: sum("inputTokens"),
      outputTokens: sum("outputTokens"),
      estimatedCostUsd: round(sum("estimatedCostUsd")),
      /** Parte paga pela plataforma (chave do .env); o resto e da chave do tenant. */
      platformCostUsd: round(sum("platformCostUsd")),
    },
    unpricedModels: [...cost.unpriced].sort(),
    conversationsByChannel: activity.conversationsByChannel,
    messagesReceivedPerDay: activity.messagesReceivedPerDay,
    organizations,
  };
}

const EMPTY_COST = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, platformCostUsd: 0 };

type Prices = Map<string, { input: number; output: number }>;

/** Custo por organizacao: tokens x preco por 1M tokens de cada modelo. */
export function estimateCost(
  rows: {
    organization_id: string;
    model: string;
    key_source: string;
    input_tokens: string;
    output_tokens: string;
  }[],
  prices: Prices,
) {
  const byOrganization = new Map<string, typeof EMPTY_COST>();
  const unpriced = new Set<string>();
  for (const row of rows) {
    const current = { ...(byOrganization.get(row.organization_id) ?? EMPTY_COST) };
    const input = Number(row.input_tokens);
    const output = Number(row.output_tokens);
    current.inputTokens += input;
    current.outputTokens += output;
    const price = prices.get(row.model);
    if (price) {
      const usd = (input * price.input + output * price.output) / 1_000_000;
      current.estimatedCostUsd += usd;
      if (row.key_source !== "tenant") current.platformCostUsd += usd;
    } else {
      unpriced.add(row.model);
    }
    byOrganization.set(row.organization_id, current);
  }
  return { byOrganization, unpriced };
}
