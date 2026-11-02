import { auditService } from "../audit/index.js";
import { channelsQuery } from "../channels/index.js";
import { contactsService, contactTaxonomy } from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { enqueueCampaignTick } from "../../queue/campaigns.queue.js";
import type { ChannelProvider, RecipientStatus } from "../../db/types.js";
import { campaignsRepository } from "./campaigns.repository.js";

export class CampaignNotFoundError extends Error {}
export class CampaignValidationError extends Error {}
export class CampaignStateError extends Error {}

/** Canais que aceitam mensagem por iniciativa da empresa: no WhatsApp, so com
 * modelo aprovado; no Telegram, texto para quem ja conversou com o bot.
 * Instagram e Messenger ficam de fora pela janela de 24 horas. */
const CAMPAIGN_PROVIDERS: ReadonlySet<ChannelProvider> = new Set(["whatsapp", "telegram"]);

export interface NewCampaignInput {
  name: string;
  connectionId: string;
  segmentId: string;
  templateId?: string | null;
  templateParams?: string[];
  text?: string | null;
  ratePerMinute?: number;
}

function audit(actorUserId: string, organizationId: string, action: string, target: string) {
  return auditService.record({ actorUserId, organizationId, action, type: "conteudo", target });
}

async function validated(organizationId: string, input: NewCampaignInput) {
  const connection = await channelsQuery.connection(organizationId, input.connectionId);
  if (!connection || !CAMPAIGN_PROVIDERS.has(connection.provider)) {
    throw new CampaignValidationError("campanha so pelo WhatsApp ou pelo Telegram");
  }
  const segment = await contactTaxonomy.findSegment(organizationId, input.segmentId);
  if (!segment) throw new CampaignValidationError("segmento nao encontrado");

  if (connection.provider === "whatsapp") {
    const template = input.templateId
      ? await channelsQuery.template(organizationId, input.templateId)
      : null;
    if (!template || template.connectionId !== connection.id || template.status !== "APPROVED") {
      throw new CampaignValidationError("no WhatsApp a campanha precisa de um modelo aprovado");
    }
    if ((input.templateParams ?? []).length !== template.variables) {
      throw new CampaignValidationError("preencha todas as variaveis do modelo");
    }
  } else if (!input.text?.trim()) {
    throw new CampaignValidationError("escreva o texto da campanha");
  }
  return { connection, segment };
}

export const campaignsService = {
  list(organizationId: string) {
    return campaignsRepository.list(organizationId);
  },

  async create(actorUserId: string, organizationId: string, input: NewCampaignInput) {
    const { connection } = await validated(organizationId, input);
    const campaign = await campaignsRepository.insert({
      organizationId,
      name: input.name,
      connectionId: input.connectionId,
      segmentId: input.segmentId,
      templateId: connection.provider === "whatsapp" ? (input.templateId ?? null) : null,
      templateParams: connection.provider === "whatsapp" ? (input.templateParams ?? []) : [],
      text: connection.provider === "telegram" ? input.text!.trim() : null,
      ratePerMinute: input.ratePerMinute ?? 30,
      createdBy: actorUserId,
    });
    await audit(actorUserId, organizationId, "Criou campanha", campaign.name);
    return campaign;
  },

  /** Quantos receberiam agora, e por que os outros ficariam de fora. */
  async preview(organizationId: string, connectionId: string, segmentId: string) {
    const connection = await channelsQuery.connection(organizationId, connectionId);
    const segment = await contactTaxonomy.findSegment(organizationId, segmentId);
    if (!connection || !segment) throw new CampaignValidationError("canal ou segmento invalido");
    const audience = await contactsService.audience(
      organizationId,
      segment.filter,
      connection.provider,
    );
    return {
      eligible: audience.eligible.length,
      withoutConsent: audience.withoutConsent,
      withoutAddress: audience.withoutAddress,
    };
  },

  /**
   * Fixa o publico (foto do segmento agora, so com opt-in e endereco no canal)
   * e agenda o primeiro lote. Sem data, comeca ja.
   */
  async schedule(actorUserId: string, organizationId: string, id: string, at?: Date) {
    const campaign = await campaignsRepository.find(organizationId, id);
    if (!campaign) throw new CampaignNotFoundError();
    if (campaign.status !== "rascunho") throw new CampaignStateError();
    const { connection, segment } = await validated(organizationId, {
      name: campaign.name,
      connectionId: campaign.connection_id ?? "",
      segmentId: campaign.segment_id ?? "",
      templateId: campaign.template_id,
      templateParams: campaign.template_params,
      text: campaign.text,
    });

    const audience = await contactsService.audience(
      organizationId,
      segment.filter,
      connection.provider,
    );
    if (audience.eligible.length === 0) {
      throw new CampaignValidationError("nenhum contato do segmento tem opt-in neste canal");
    }
    await campaignsRepository.insertRecipients(organizationId, id, audience.eligible);
    const when = at && at.getTime() > Date.now() ? at : new Date();
    await campaignsRepository.setStatus(id, "agendada", {
      scheduledAt: when,
      filter: segment.filter,
    });
    await enqueueCampaignTick({ organizationId, campaignId: id }, when.getTime() - Date.now());
    await audit(
      actorUserId,
      organizationId,
      `Agendou campanha para ${audience.eligible.length} contato(s)`,
      campaign.name,
    );
    return campaignsService.get(organizationId, id);
  },

  /** Para de enviar; o que ja saiu fica no historico. */
  async cancel(actorUserId: string, organizationId: string, id: string) {
    const campaign = await campaignsRepository.find(organizationId, id);
    if (!campaign) throw new CampaignNotFoundError();
    if (!["rascunho", "agendada", "enviando"].includes(campaign.status)) {
      throw new CampaignStateError();
    }
    await campaignsRepository.setStatus(id, "cancelada", { finishedAt: new Date() });
    await audit(actorUserId, organizationId, "Cancelou campanha", campaign.name);
    return campaignsService.get(organizationId, id);
  },

  async get(organizationId: string, id: string) {
    const campaign = await campaignsRepository.find(organizationId, id);
    if (!campaign) return null;

    const [counts, sentIds, recipients] = await Promise.all([
      campaignsRepository.statusCounts(id),
      campaignsRepository.sentMessageIds(id),
      campaignsRepository.recipients(id),
    ]);
    const [outcomes, labels, delivery] = await Promise.all([
      conversationsService.messageOutcomes(sentIds),
      contactsService.labelsFor(
        organizationId,
        recipients.map((r) => r.contact_id),
      ),
      conversationsService.deliveryOf(
        recipients.flatMap((r) => (r.message_id ? [r.message_id] : [])),
      ),
    ]);
    const count = (status: RecipientStatus) => counts.get(status) ?? 0;

    return {
      ...campaign,
      stats: {
        total: [...counts.values()].reduce((a, b) => a + b, 0),
        pending: count("pendente"),
        sent: count("enviada"),
        failed: count("falhou"),
        skipped: count("ignorada"),
        ...outcomes,
      },
      recipients: recipients.map((r) => ({
        ...r,
        label: labels.get(r.contact_id) ?? "Contato",
        delivery_status: r.message_id ? (delivery.get(r.message_id) ?? null) : null,
      })),
    };
  },
};
