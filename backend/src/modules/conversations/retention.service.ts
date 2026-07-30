import { assistantsService } from "../assistants/index.js";
import { auditService } from "../audit/index.js";
import { conversationsRepository } from "./conversations.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Job de retencao (ADR-002 #6): expurga conversas alem da politica efetiva
 * de cada assistente. So agrega contagem no audit_event, nunca conteudo de
 * conversa. Chamado pelo worker (fila `retention`), nao pela API HTTP.
 */
export const retentionService = {
  async purgeExpired(): Promise<{ organizationId: string; deleted: number }[]> {
    const assistants = await assistantsService.listAllWithEffectiveRetention();
    const byOrganization = new Map<string, number>();

    for (const assistant of assistants) {
      const cutoff = new Date(Date.now() - assistant.retentionDays * DAY_MS);
      const deleted = await conversationsRepository.deleteOlderThan(assistant.id, cutoff);
      if (deleted > 0) {
        byOrganization.set(assistant.organizationId, (byOrganization.get(assistant.organizationId) ?? 0) + deleted);
      }
    }

    const summary = [...byOrganization.entries()].map(([organizationId, deleted]) => ({ organizationId, deleted }));

    await Promise.all(
      summary.map(({ organizationId, deleted }) =>
        auditService.record({
          actorUserId: null,
          organizationId,
          action: "Expurgou conversas por retencao",
          type: "seguranca",
          target: `${deleted} conversa(s)`,
        }),
      ),
    );

    return summary;
  },
};
