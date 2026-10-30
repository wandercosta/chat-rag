import { auditService } from "../audit/index.js";
import { automationsRepository } from "./automations.repository.js";
import type { RuleInput } from "./rules.js";

export class RuleNotFoundError extends Error {}

/**
 * Regras de automacao (ADR-006 #4): so o Administrador cria, edita, liga e
 * desliga, e a auditoria guarda quem fez — e quem responde pelo que a regra
 * faz enquanto ela estiver ligada.
 */
export const automationsService = {
  list(organizationId: string) {
    return automationsRepository.list(organizationId);
  },

  async create(actorUserId: string, organizationId: string, input: RuleInput) {
    const rule = await automationsRepository.insert(organizationId, input, actorUserId);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou automacao",
      type: "configuracao",
      target: rule.name,
    });
    return rule;
  },

  async update(actorUserId: string, organizationId: string, id: string, input: RuleInput) {
    const rule = await automationsRepository.update(organizationId, id, input, actorUserId);
    if (!rule) throw new RuleNotFoundError();
    await auditService.record({
      actorUserId,
      organizationId,
      action: `Editou automacao (versao ${rule.version})`,
      type: "configuracao",
      target: rule.name,
    });
    return rule;
  },

  async setEnabled(actorUserId: string, organizationId: string, id: string, enabled: boolean) {
    const rule = await automationsRepository.setEnabled(organizationId, id, enabled, actorUserId);
    if (!rule) throw new RuleNotFoundError();
    await auditService.record({
      actorUserId,
      organizationId,
      action: enabled ? "Ligou automacao" : "Desligou automacao",
      type: "configuracao",
      target: `${rule.name} (versao ${rule.version})`,
    });
    return rule;
  },

  async remove(actorUserId: string, organizationId: string, id: string) {
    const rule = await automationsRepository.find(organizationId, id);
    if (!rule) throw new RuleNotFoundError();
    await automationsRepository.remove(organizationId, id);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Excluiu automacao",
      type: "configuracao",
      target: rule.name,
    });
  },

  async runs(organizationId: string, id: string) {
    if (!(await automationsRepository.find(organizationId, id))) throw new RuleNotFoundError();
    return automationsRepository.runs(organizationId, id);
  },
};
