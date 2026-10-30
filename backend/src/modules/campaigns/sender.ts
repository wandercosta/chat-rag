import { sendToContact } from "../channels/index.js";
import { contactsService } from "../contacts/index.js";
import { redis } from "../../db/redis.js";
import { enqueueCampaignTick } from "../../queue/campaigns.queue.js";
import { campaignsRepository } from "./campaigns.repository.js";

/**
 * Teto por organizacao por minuto, somando todas as campanhas dela: uma
 * campanha grande nao estoura o limite do provedor nem a fila dos outros
 * tenants (ADR-006 #9, mesmo raciocinio do ADR-002 #4).
 */
export const ORG_SENDS_PER_MINUTE = 120;
const NEXT_TICK_MS = 60_000;

/** Reserva ate `wanted` envios no minuto atual da organizacao. */
async function reserve(organizationId: string, wanted: number): Promise<number> {
  const key = `campaign-rate:${organizationId}:${Math.floor(Date.now() / 60_000)}`;
  const used = await redis.incrby(key, wanted);
  await redis.expire(key, 120);
  const granted = Math.max(0, Math.min(wanted, ORG_SENDS_PER_MINUTE - (used - wanted)));
  if (granted < wanted) await redis.decrby(key, wanted - granted);
  return granted;
}

/** Valores das variaveis: "{{nome}}" vira o nome do contato. */
function personalize(params: string[], name: string | null) {
  return params.map((p) => p.replace(/\{\{\s*nome\s*\}\}/gi, name?.split(" ")[0] || "cliente"));
}

/**
 * Um lote da campanha (job do worker). Respeita o ritmo da campanha e o teto
 * da organizacao, confere o opt-in de novo na hora (a pessoa pode ter saido
 * depois do agendamento) e agenda o proximo lote ate acabar.
 */
export async function runCampaignTick(organizationId: string, campaignId: string) {
  const campaign = await campaignsRepository.find(organizationId, campaignId);
  if (!campaign || !["agendada", "enviando"].includes(campaign.status)) return;
  if (campaign.status === "agendada") {
    await campaignsRepository.setStatus(campaignId, "enviando", { startedAt: new Date() });
  }

  const granted = await reserve(organizationId, campaign.rate_per_minute);
  const batch = await campaignsRepository.nextPending(campaignId, granted);
  const names = await contactsService.labelsFor(
    organizationId,
    batch.map((r) => r.contact_id),
  );

  for (const recipient of batch) {
    // Cancelada no meio do lote: para aqui.
    const current = await campaignsRepository.find(organizationId, campaignId);
    if (current?.status === "cancelada") return;

    if (!(await contactsService.isOptedIn(organizationId, recipient.contact_id))) {
      await campaignsRepository.updateRecipient(recipient.id, {
        status: "ignorada",
        error: "saiu das campanhas",
      });
      continue;
    }

    const result = await sendToContact({
      organizationId,
      connectionId: campaign.connection_id ?? "",
      contactId: recipient.contact_id,
      actorUserId: campaign.created_by,
      existingMessageId: recipient.message_id,
      content: campaign.template_id
        ? {
            kind: "template",
            templateId: campaign.template_id,
            params: personalize(campaign.template_params, names.get(recipient.contact_id) ?? null),
          }
        : { kind: "text", text: campaign.text ?? "" },
    });

    if (result.status === "tentar_de_novo" && !recipient.message_id) {
      // Erro temporario: fica pendente com a mesma mensagem e o proximo lote
      // tenta uma vez mais. Na segunda falha, desiste.
      await campaignsRepository.keepMessage(recipient.id, result.messageId, result.error);
    } else {
      await campaignsRepository.updateRecipient(recipient.id, {
        status: result.status === "enviada" ? "enviada" : "falhou",
        messageId: result.messageId,
        error: result.status === "enviada" ? null : result.error,
      });
    }
  }

  const remaining = await campaignsRepository.nextPending(campaignId, 1);
  if (remaining.length > 0) {
    await enqueueCampaignTick({ organizationId, campaignId }, NEXT_TICK_MS);
  } else {
    await campaignsRepository.setStatus(campaignId, "concluida", { finishedAt: new Date() });
  }
}
