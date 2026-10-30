import { auditService } from "../audit/index.js";
import type { ContactFieldType, ContactFilter } from "../../db/types.js";
import { normalizeKey } from "./normalize.js";
import { taxonomyRepository } from "./taxonomy.repository.js";

export class DuplicateNameError extends Error {}

/** Colunas que a importacao ja entende; um campo com essa chave confundiria. */
const RESERVED_KEYS = new Set([
  "nome",
  "name",
  "email",
  "e_mail",
  "telefone",
  "phone",
  "celular",
  "whatsapp",
  "etiquetas",
  "tags",
  "opt_in",
  "optin",
]);

export class ReservedFieldKeyError extends Error {}

function audit(actorUserId: string, organizationId: string, action: string, target: string) {
  return auditService.record({
    actorUserId,
    organizationId,
    action,
    type: "configuracao",
    target,
  });
}

export const taxonomyService = {
  listTags: (organizationId: string) => taxonomyRepository.listTags(organizationId),

  async createTag(actorUserId: string, organizationId: string, name: string, color?: string) {
    const existing = (await taxonomyRepository.listTags(organizationId)).find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) throw new DuplicateNameError();
    const tag = await taxonomyRepository.ensureTag(organizationId, name, color);
    await audit(actorUserId, organizationId, "Criou etiqueta de contato", name);
    return tag;
  },

  async removeTag(actorUserId: string, organizationId: string, id: string) {
    const removed = await taxonomyRepository.removeTag(organizationId, id);
    if (removed) await audit(actorUserId, organizationId, "Removeu etiqueta de contato", id);
    return removed;
  },

  listFields: (organizationId: string) => taxonomyRepository.listFields(organizationId),

  /** A chave sai do rotulo ("Data de nascimento" -> "data_de_nascimento") e e
   * o nome da coluna na importacao e na exportacao. */
  async createField(
    actorUserId: string,
    organizationId: string,
    label: string,
    type: ContactFieldType,
  ) {
    const key = normalizeKey(label);
    if (!key || RESERVED_KEYS.has(key)) throw new ReservedFieldKeyError();
    const field = await taxonomyRepository.insertField(organizationId, key, label.trim(), type);
    if (!field) throw new DuplicateNameError();
    await audit(actorUserId, organizationId, "Criou campo de contato", key);
    return field;
  },

  async removeField(actorUserId: string, organizationId: string, id: string) {
    const removed = await taxonomyRepository.removeField(organizationId, id);
    if (removed) await audit(actorUserId, organizationId, "Removeu campo de contato", id);
    return removed;
  },

  listSegments: (organizationId: string) => taxonomyRepository.listSegments(organizationId),

  findSegment: (organizationId: string, id: string) =>
    taxonomyRepository.findSegment(organizationId, id),

  async createSegment(
    actorUserId: string,
    organizationId: string,
    name: string,
    filter: ContactFilter,
  ) {
    const segment = await taxonomyRepository.insertSegment(organizationId, name.trim(), filter);
    if (!segment) throw new DuplicateNameError();
    await audit(actorUserId, organizationId, "Criou segmento de contatos", name);
    return segment;
  },

  async removeSegment(actorUserId: string, organizationId: string, id: string) {
    const removed = await taxonomyRepository.removeSegment(organizationId, id);
    if (removed) await audit(actorUserId, organizationId, "Removeu segmento de contatos", id);
    return removed;
  },
};
