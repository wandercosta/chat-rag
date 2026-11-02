import { contactsService } from "../contacts/index.js";
import { automationsRepository } from "./automations.repository.js";
import { matches } from "./conditions.js";
import { runActions, runLogged } from "./engine.js";

/**
 * Gatilho "etiqueta adicionada" (worker, fila `automations`): todas as regras
 * ligadas que casam rodam, na ordem de criacao. Nao ha conversa de origem; o
 * modelo enviado cai na conversa do contato naquele numero.
 */
export async function onTagAdded(organizationId: string, contactId: string, tagId: string) {
  const rules = await automationsRepository.enabled(organizationId, "etiqueta_adicionada");
  if (rules.length === 0) return 0;
  const contact = await contactsService.get(organizationId, contactId);
  if (!contact) return 0;

  const ctx = {
    channel: "",
    text: "",
    isFirstMessage: false,
    contactTagIds: await contactsService.tagIdsOf(contactId),
    now: new Date(),
    addedTagId: tagId,
  };
  let executed = 0;
  for (const rule of rules) {
    if (!matches(rule.conditions, ctx)) continue;
    await runLogged(organizationId, rule, null, async () => {
      const result = await runActions(
        organizationId,
        null,
        contactId,
        rule.actions,
        rule.updated_by,
        contact.name,
      );
      return result.detail;
    });
    executed++;
  }
  return executed;
}
