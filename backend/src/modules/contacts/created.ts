import { webhooksService } from "../webhooks/index.js";
import { contactsRepository, type ContactValues } from "./contacts.repository.js";

/**
 * Todo contato novo passa por aqui (painel, importacao, widget, canais), para
 * o webhook "contato.criado" sair de um lugar so.
 */
export async function insertContact(organizationId: string, values: ContactValues) {
  const contact = await contactsRepository.insert(organizationId, values);
  await webhooksService.emit(organizationId, "contato.criado", {
    contactId: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    createdAt: contact.created_at,
  });
  return contact;
}
