import { auditService } from "../audit/index.js";
import { organizationsService } from "../organizations/index.js";
import { assistantsRepository, type AssistantUpdateInput } from "./assistants.repository.js";
import { modelCatalogRepository } from "./model-catalog.repository.js";

export class ModelNotAllowedError extends Error {}

/** Padrao de plataforma quando nem assistente nem organizacao definem um
 * valor (docs/security/privacidade-e-acesso.md - Retencao). */
const PLATFORM_DEFAULT_RETENTION_DAYS = 90;

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

  /** Politica efetiva por assistente: assistente > organizacao > padrao de
   * plataforma. Usado pelo job de retencao (modulo conversations). */
  async listAllWithEffectiveRetention(): Promise<{ id: string; organizationId: string; retentionDays: number }[]> {
    const rows = await assistantsRepository.listAll();
    const orgCache = new Map<string, number | null>();

    const result = [];
    for (const row of rows) {
      if (!orgCache.has(row.organization_id)) {
        orgCache.set(row.organization_id, await organizationsService.getRetentionDays(row.organization_id));
      }
      const orgDays = orgCache.get(row.organization_id) ?? null;
      result.push({
        id: row.id,
        organizationId: row.organization_id,
        retentionDays: row.retention_days ?? orgDays ?? PLATFORM_DEFAULT_RETENTION_DAYS,
      });
    }
    return result;
  },
};
