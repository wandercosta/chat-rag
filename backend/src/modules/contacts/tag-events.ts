import { enqueueTagAdded } from "../../queue/automations.queue.js";

/**
 * Contato ganhou etiqueta (painel, importacao, API ou automacao): o worker
 * roda as automacoes "etiqueta adicionada". Vai pela fila para o modulo de
 * contatos nao depender do de automacoes (que ja depende dele). So entram
 * etiquetas novas: reetiquetar nao dispara de novo, e por isso uma regra que
 * etiqueta nao entra em ciclo.
 */
export async function announceTagsAdded(
  organizationId: string,
  contactId: string,
  tagIds: string[],
) {
  for (const tagId of tagIds) {
    await enqueueTagAdded({ organizationId, contactId, tagId });
  }
}
