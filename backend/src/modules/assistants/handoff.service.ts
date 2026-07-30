import { auditService } from "../audit/index.js";
import { handoffRepository } from "./handoff.repository.js";

export class NoHandoffConfiguredError extends Error {}
export class SectorNotFoundError extends Error {}

export type HandoffResolution =
  | { needsSectorSelection: true; sectors: { id: string; name: string }[] }
  | { needsSectorSelection: false; whatsappUrl: string; sectorName: string };

export function buildWhatsAppUrl(phoneNumber: string, lastQuestion: string): string {
  const digits = phoneNumber.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(lastQuestion)}`;
}

export const handoffService = {
  list(assistantId: string) {
    return handoffRepository.listForAssistant(assistantId);
  },

  async create(actorUserId: string, organizationId: string, assistantId: string, sectorName: string, phoneNumber: string) {
    const config = await handoffRepository.insert(organizationId, assistantId, sectorName, phoneNumber);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou setor de encaminhamento WhatsApp",
      type: "configuracao",
      target: `${sectorName} · assistente ${assistantId}`,
    });
    return config;
  },

  async remove(actorUserId: string, organizationId: string, assistantId: string, id: string) {
    await handoffRepository.remove(assistantId, id);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Removeu setor de encaminhamento WhatsApp",
      type: "configuracao",
      target: id,
    });
  },

  /**
   * Resolucao usada pelo widget publico. Sem setor informado e com mais de um
   * configurado, devolve a lista para o widget mostrar botoes de escolha
   * (docs/integrations/widget-embed.md - Encaminhamento); nunca envia o
   * historico completo, so a ultima pergunta.
   */
  async resolveForWidget(assistantId: string, lastQuestion: string, sectorId?: string): Promise<HandoffResolution> {
    const configs = await handoffRepository.listForAssistant(assistantId);
    if (configs.length === 0) throw new NoHandoffConfiguredError();

    if (sectorId) {
      const chosen = configs.find((c) => c.id === sectorId);
      if (!chosen) throw new SectorNotFoundError();
      return { needsSectorSelection: false, whatsappUrl: buildWhatsAppUrl(chosen.phone_number, lastQuestion), sectorName: chosen.sector_name };
    }

    if (configs.length > 1) {
      return { needsSectorSelection: true, sectors: configs.map((c) => ({ id: c.id, name: c.sector_name })) };
    }

    const only = configs[0];
    return { needsSectorSelection: false, whatsappUrl: buildWhatsAppUrl(only.phone_number, lastQuestion), sectorName: only.sector_name };
  },
};
