import { gapsRepository } from "./gaps.repository.js";

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

export const gapsService = {
  list(organizationId: string) {
    return gapsRepository.listForOrganization(organizationId);
  },

  /** Chamado pelo modulo rag quando a relevancia recuperada fica abaixo do
   * limiar configurado (docs/workflows/rag-e-conhecimento.md - Lacunas). */
  recordOccurrence(organizationId: string, assistantId: string, question: string) {
    return gapsRepository.upsertOccurrence(organizationId, assistantId, normalizeQuestion(question));
  },

  resolve(organizationId: string, id: string) {
    return gapsRepository.resolve(organizationId, id);
  },
};
