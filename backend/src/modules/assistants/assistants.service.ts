import { auditService } from "../audit/index.js";
import { assistantsRepository, type AssistantUpdateInput } from "./assistants.repository.js";
import { modelCatalogRepository } from "./model-catalog.repository.js";

export class ModelNotAllowedError extends Error {}

export const assistantsService = {
  list(organizationId: string) {
    return assistantsRepository.listForOrganization(organizationId);
  },

  get(organizationId: string, id: string) {
    return assistantsRepository.findById(organizationId, id);
  },

  async create(
    actorUserId: string,
    organizationId: string,
    input: { name: string; modelId: string; instructions?: string | null },
  ) {
    const allowed = await modelCatalogRepository.isAllowedForTenant(organizationId, input.modelId);
    if (!allowed) throw new ModelNotAllowedError();

    const assistant = await assistantsRepository.insert({
      organizationId,
      name: input.name,
      modelId: input.modelId,
      instructions: input.instructions ?? null,
    });

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou assistente",
      type: "conteudo",
      target: assistant.name,
    });

    return assistant;
  },

  async update(actorUserId: string, organizationId: string, id: string, input: AssistantUpdateInput) {
    if (input.modelId) {
      const allowed = await modelCatalogRepository.isAllowedForTenant(organizationId, input.modelId);
      if (!allowed) throw new ModelNotAllowedError();
    }

    const assistant = await assistantsRepository.update(organizationId, id, input);

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Atualizou assistente",
      type: "conteudo",
      target: id,
    });

    return assistant;
  },
};
