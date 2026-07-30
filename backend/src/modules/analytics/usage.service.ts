import { gapsService } from "../conversations/index.js";
import { usageRepository, type UsageEventInput } from "./usage.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const usageService = {
  /** Fire-and-forget por design: instrumentacao nunca deve derrubar o
   * caminho principal (resposta do RAG, indexacao, widget). */
  record(input: UsageEventInput) {
    return usageRepository.insert(input).catch((err) => {
      console.error("falha ao registrar usage_event:", err);
    });
  },

  /**
   * Resumo minimo do "Painel de metricas" (docs/observability/operacao.md).
   * Ainda nao agrega conversas/mensagens/fontes com erro — ver ADR-002 se
   * isso precisar de decisao de escala antes de crescer.
   */
  async getSummary(organizationId: string, days = 30) {
    const since = new Date(Date.now() - days * DAY_MS);
    const [eventCounts, avgRagLatencyMs, gaps] = await Promise.all([
      usageRepository.countByType(organizationId, since),
      usageRepository.averageRagLatencyMs(organizationId, since),
      gapsService.list(organizationId),
    ]);

    return {
      periodDays: days,
      eventCounts: Object.fromEntries(eventCounts.map((row) => [row.type, Number(row.count)])),
      avgRagLatencyMs: avgRagLatencyMs ? Math.round(Number(avgRagLatencyMs)) : null,
      openGaps: gaps.filter((g) => g.status === "pendente").length,
    };
  },
};
