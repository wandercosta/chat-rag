import { auditService } from "../audit/index.js";
import { conversationsService } from "../conversations/index.js";
import type { ContactFilter } from "../../db/types.js";
import { contactsRepository, type ContactValues } from "./contacts.repository.js";
import { identitiesRepository } from "./identities.repository.js";
import { normalizeEmail, normalizePhone } from "./normalize.js";
import { taxonomyRepository } from "./taxonomy.repository.js";

export class ContactNotFoundError extends Error {}
export class ConversationNotFoundError extends Error {}
export class ConversationAlreadyLinkedError extends Error {}
export class InvalidContactFieldError extends Error {
  constructor(public field: "email" | "phone") {
    super(field);
  }
}
export class DuplicateContactError extends Error {
  constructor(public field: "email" | "phone") {
    super(field);
  }
}

export interface ContactInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  optIn?: boolean;
  customFields?: Record<string, string>;
  tagIds?: string[];
}

type ContactRow = NonNullable<Awaited<ReturnType<typeof contactsRepository.findById>>>;

const PAGE_SIZE = 50;

/** Normaliza e-mail e telefone; valor informado e invalido e erro, vazio e null. */
function prepare(input: ContactInput): ContactValues {
  const values: ContactValues = {};
  if (input.name !== undefined) values.name = input.name?.trim() || null;
  if (input.email !== undefined) {
    values.email = normalizeEmail(input.email);
    if (input.email?.trim() && !values.email) throw new InvalidContactFieldError("email");
  }
  if (input.phone !== undefined) {
    values.phone = normalizePhone(input.phone);
    if (input.phone?.trim() && !values.phone) throw new InvalidContactFieldError("phone");
  }
  if (input.customFields !== undefined) values.customFields = input.customFields;
  return values;
}

/**
 * Opt-in de campanha (ADR-006 #9): marcar registra quando e de onde; desmarcar
 * registra o opt-out, que vence o opt-in ate alguem marcar de novo.
 */
function optInChange(current: ContactRow | null, optIn: boolean | undefined, source: string) {
  if (optIn === undefined) return {};
  const optedIn = !!current?.opt_in_at && !current.opted_out_at;
  if (optIn && !optedIn) return { optInAt: new Date(), optInSource: source, optedOutAt: null };
  if (!optIn && optedIn) return { optedOutAt: new Date() };
  return {};
}

async function assertUnique(organizationId: string, values: ContactValues, exceptId?: string) {
  if (values.email) {
    const other = await contactsRepository.findByEmail(organizationId, values.email);
    if (other && other.id !== exceptId) throw new DuplicateContactError("email");
  }
  if (values.phone) {
    const other = await contactsRepository.findByPhone(organizationId, values.phone);
    if (other && other.id !== exceptId) throw new DuplicateContactError("phone");
  }
}

async function withTags<T extends { id: string }>(contacts: T[]) {
  const links = await taxonomyRepository.tagsOf(contacts.map((c) => c.id));
  return contacts.map((c) => ({
    ...c,
    tags: links
      .filter((l) => l.contact_id === c.id)
      .map(({ id, name, color }) => ({ id, name, color })),
  }));
}

export const contactsService = {
  async list(organizationId: string, filter: ContactFilter, page = 1) {
    const offset = (Math.max(page, 1) - 1) * PAGE_SIZE;
    const { items, total } = await contactsRepository.list(
      organizationId,
      filter,
      PAGE_SIZE,
      offset,
    );
    return { items: await withTags(items), total, page, pageSize: PAGE_SIZE };
  },

  async get(organizationId: string, id: string) {
    const contact = await contactsRepository.findById(organizationId, id);
    if (!contact) return null;
    const [[withTag], identities, conversations] = await Promise.all([
      withTags([contact]),
      identitiesRepository.listFor(organizationId, id),
      conversationsService.listSummaries(organizationId, { contactId: id, limit: 50 }),
    ]);
    return { ...withTag, identities, conversations };
  },

  async create(actorUserId: string, organizationId: string, input: ContactInput) {
    const values = prepare(input);
    await assertUnique(organizationId, values);
    const contact = await contactsRepository.insert(organizationId, {
      ...values,
      ...optInChange(null, input.optIn, "painel"),
    });
    if (input.tagIds?.length) {
      await taxonomyRepository.setContactTags(organizationId, contact.id, input.tagIds);
    }
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou contato",
      type: "conteudo",
      target: contact.id,
    });
    return contact;
  },

  async update(actorUserId: string, organizationId: string, id: string, input: ContactInput) {
    const current = await contactsRepository.findById(organizationId, id);
    if (!current) throw new ContactNotFoundError();

    const values = prepare(input);
    await assertUnique(organizationId, values, id);
    const contact = await contactsRepository.update(organizationId, id, {
      ...values,
      ...optInChange(current, input.optIn, "painel"),
    });
    if (input.tagIds !== undefined) {
      await taxonomyRepository.setContactTags(organizationId, id, input.tagIds);
    }
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Atualizou contato",
      type: "conteudo",
      target: id,
    });
    return contact;
  },

  /** Exclusao a pedido do titular (LGPD): leva junto identidades, etiquetas e
   * as conversas dele. A auditoria guarda o id, nunca nome ou e-mail. */
  async remove(actorUserId: string, organizationId: string, id: string) {
    const contact = await contactsRepository.findById(organizationId, id);
    if (!contact) throw new ContactNotFoundError();

    const conversations = await conversationsService.deleteForContact(organizationId, id);
    await contactsRepository.remove(organizationId, id);
    await auditService.record({
      actorUserId,
      organizationId,
      action: `Excluiu contato e ${conversations} conversa(s)`,
      type: "seguranca",
      target: id,
    });
  },

  /**
   * Visitante identificado no widget (e-mail ou id externo) vira contato
   * (ADR-006 #8): reaproveita a identidade do widget ou um contato com o mesmo
   * e-mail; senao, cria. Visitante anonimo nao vira contato sozinho.
   */
  async resolveForVisitor(
    organizationId: string,
    visitor: {
      id: string;
      name: string | null;
      email: string | null;
      external_user_id: string | null;
    },
  ): Promise<string | null> {
    const email = normalizeEmail(visitor.email);
    if (!email && !visitor.external_user_id) return null;

    const identity = await identitiesRepository.find(organizationId, "widget", visitor.id);
    if (identity) return identity.contact_id;

    const contact =
      (email && (await contactsRepository.findByEmail(organizationId, email))) ||
      (await contactsRepository.insert(organizationId, { name: visitor.name, email }));
    if (!contact.name && visitor.name) {
      await contactsRepository.update(organizationId, contact.id, { name: visitor.name });
    }
    const linked = await identitiesRepository.link(
      organizationId,
      contact.id,
      "widget",
      visitor.id,
    );
    return linked?.contact_id ?? contact.id;
  },

  /**
   * "Salvar como contato" na caixa de entrada. Se ja existe contato com o mesmo
   * e-mail ou telefone, a conversa e ligada a ele em vez de duplicar.
   */
  async createFromConversation(
    actorUserId: string,
    organizationId: string,
    conversationId: string,
    input: ContactInput,
  ) {
    const conversation = await conversationsService.get(organizationId, conversationId);
    if (!conversation) throw new ConversationNotFoundError();
    if (conversation.contact_id) throw new ConversationAlreadyLinkedError();

    const values = prepare(input);
    const existing =
      (values.email && (await contactsRepository.findByEmail(organizationId, values.email))) ||
      (values.phone && (await contactsRepository.findByPhone(organizationId, values.phone))) ||
      null;
    const contact = existing ?? (await contactsService.create(actorUserId, organizationId, input));

    if (conversation.visitor_id) {
      await identitiesRepository.link(
        organizationId,
        contact.id,
        "widget",
        conversation.visitor_id,
      );
      await conversationsService.setContactForVisitor(
        organizationId,
        conversation.visitor_id,
        contact.id,
      );
    }
    await conversationsService.setContact(organizationId, conversationId, contact.id);
    return { contact, merged: !!existing };
  },

  /** Nome para mostrar em outras telas (fila da caixa de entrada). */
  async labelsFor(organizationId: string, ids: string[]) {
    const contacts = await contactsRepository.findByIds(organizationId, [...new Set(ids)]);
    return new Map(contacts.map((c) => [c.id, c.name ?? c.email ?? c.phone ?? "Contato"]));
  },
};
