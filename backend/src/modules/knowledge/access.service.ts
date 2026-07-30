import { collectionsRepository } from "./collections.repository.js";

/** Superficie minima exposta a outros modulos (ex.: rag) para escopar
 * recuperacao sem expor as tabelas internas de colecoes/topicos. */
export const knowledgeAccessService = {
  listAccessibleTopicIds(organizationId: string, assistantId: string): Promise<string[]> {
    return collectionsRepository.listAccessibleTopicIds(organizationId, assistantId);
  },
};
