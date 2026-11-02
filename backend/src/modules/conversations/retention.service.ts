import { assistantsService } from "../assistants/index.js";
import { auditService } from "../audit/index.js";
import { anonymizeRepository } from "./anonymize.repository.js";
import { attachmentsService } from "./attachments.service.js";
import { conversationsRepository } from "./conversations.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionSummary {
  organizationId: string;
  deleted: number;
  anonymized: number;
  /** Para o worker apagar as notas internas (tabela do modulo inbox). */
  anonymizedConversationIds: string[];
}

/**
 * Job de retencao (ADR-002 #6): alem da politica efetiva de cada assistente,
 * exclui as conversas ou, se a organizacao escolheu, anonimiza (a conversa
 * fica para metricas, sem conteudo, anexos nem ligacao com visitante ou
 * contato). So agrega contagem no audit_event, nunca conteudo. Chamado pelo
 * worker (fila `retention`), nao pela API HTTP.
 */
export const retentionService = {
  async purgeExpired(): Promise<RetentionSummary[]> {
    const assistants = await assistantsService.listAllWithEffectiveRetention();
    const byOrganization = new Map<string, RetentionSummary>();
    const entry = (organizationId: string) => {
      let row = byOrganization.get(organizationId);
      if (!row) {
        row = { organizationId, deleted: 0, anonymized: 0, anonymizedConversationIds: [] };
        byOrganization.set(organizationId, row);
      }
      return row;
    };

    for (const assistant of assistants) {
      const cutoff = new Date(Date.now() - assistant.retentionDays * DAY_MS);
      if (assistant.mode === "anonimizar") {
        const ids = await anonymizeRepository.expiredIds(assistant.id, cutoff);
        if (ids.length === 0) continue;
        await attachmentsService.removeForConversations(ids);
        await anonymizeRepository.anonymize(ids);
        const row = entry(assistant.organizationId);
        row.anonymized += ids.length;
        row.anonymizedConversationIds.push(...ids);
        continue;
      }
      await attachmentsService.deleteFilesFor({ assistantId: assistant.id, before: cutoff });
      const deleted = await conversationsRepository.deleteOlderThan(assistant.id, cutoff);
      if (deleted > 0) entry(assistant.organizationId).deleted += deleted;
    }

    const summary = [...byOrganization.values()];
    for (const row of summary) {
      if (row.deleted > 0) {
        await auditService.record({
          actorUserId: null,
          organizationId: row.organizationId,
          action: "Expurgou conversas por retencao",
          type: "seguranca",
          target: `${row.deleted} conversa(s)`,
        });
      }
      if (row.anonymized > 0) {
        await auditService.record({
          actorUserId: null,
          organizationId: row.organizationId,
          action: "Anonimizou conversas por retencao",
          type: "seguranca",
          target: `${row.anonymized} conversa(s)`,
        });
      }
    }
    return summary;
  },
};
