import { modelCatalogRepository } from "./model-catalog.repository.js";

/** Superficie minima exposta a outros modulos (ex.: rag, para saber qual
 * modelo usar numa chamada de chat). Nao expoe operacoes de escrita do Master. */
export const modelCatalogService = {
  isAllowedForTenant(organizationId: string, modelId: string) {
    return modelCatalogRepository.isAllowedForTenant(organizationId, modelId);
  },

  findById(modelId: string) {
    return modelCatalogRepository.findById(modelId);
  },
};
