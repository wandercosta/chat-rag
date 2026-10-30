import type { ContactChannel, ContactFilter } from "../../db/types.js";
import { contactsRepository } from "./contacts.repository.js";
import { identitiesRepository } from "./identities.repository.js";
import { normalizeEmail, normalizePhone } from "./normalize.js";
import { taxonomyRepository } from "./taxonomy.repository.js";

/**
 * Como o CRM se liga ao resto: visitante do widget, remetente de canal,
 * publico de campanha, opt-out pelo canal e nome para outras telas
 * (ADR-006 #8 e #9). Exposto junto com o cadastro em `contactsService`.
 */
/**
 * No WhatsApp o endereco e o proprio telefone (sem o "+"): contato importado
 * por planilha tambem recebe, mesmo antes de escrever pela primeira vez.
 */
function whatsappAddress(phone: string | null) {
  return phone ? phone.replace(/^\+/, "") : null;
}

export const contactLinks = {
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
   * Quem escreveu por um canal (ADR-006 #8): reaproveita a identidade do canal
   * ou um contato com o mesmo telefone; senao, cria. Diferente do widget, todo
   * remetente de canal vira contato, porque o canal ja identifica a pessoa.
   */
  async resolveForChannel(
    organizationId: string,
    channel: Exclude<ContactChannel, "widget">,
    externalId: string,
    profile: { name?: string | null; phone?: string | null },
  ): Promise<string> {
    const identity = await identitiesRepository.find(organizationId, channel, externalId);
    if (identity) return identity.contact_id;

    const phone = normalizePhone(profile.phone);
    const contact =
      (phone && (await contactsRepository.findByPhone(organizationId, phone))) ||
      (await contactsRepository.insert(organizationId, { name: profile.name ?? null, phone }));
    if (!contact.name && profile.name) {
      await contactsRepository.update(organizationId, contact.id, { name: profile.name });
    }
    const linked = await identitiesRepository.link(organizationId, contact.id, channel, externalId);
    return linked?.contact_id ?? contact.id;
  },

  /** Endereco do contato num canal (ex.: o wa_id para responder no WhatsApp). */
  async channelAddress(
    organizationId: string,
    contactId: string,
    channel: ContactChannel,
  ): Promise<string | null> {
    const identities = await identitiesRepository.listFor(organizationId, contactId);
    const identity = identities.find((i) => i.channel === channel)?.value;
    if (identity || channel !== "whatsapp") return identity ?? null;
    const contact = await contactsRepository.findById(organizationId, contactId);
    return whatsappAddress(contact?.phone ?? null);
  },

  /**
   * Publico de campanha (ADR-006 #9): do filtro, so quem tem opt-in valido e
   * um endereco no canal escolhido. Os demais so entram na contagem, para o
   * painel explicar por que ficaram de fora.
   */
  async audience(organizationId: string, filter: ContactFilter, channel: ContactChannel) {
    const matched = await contactsRepository.listAll(organizationId, filter);
    const consented = matched.filter((c) => c.opt_in_at && !c.opted_out_at);
    const addresses = await identitiesRepository.addressesFor(
      organizationId,
      consented.map((c) => c.id),
      channel,
    );
    const eligible = consented.flatMap((c) => {
      const address =
        addresses.get(c.id) ?? (channel === "whatsapp" ? whatsappAddress(c.phone) : null);
      return address ? [{ contactId: c.id, name: c.name, address }] : [];
    });
    return {
      eligible,
      withoutConsent: matched.length - consented.length,
      withoutAddress: consented.length - eligible.length,
    };
  },

  /** Opt-in ainda valido agora (pode ter saido depois do agendamento). */
  async isOptedIn(organizationId: string, contactId: string) {
    const contact = await contactsRepository.findById(organizationId, contactId);
    return !!contact?.opt_in_at && !contact.opted_out_at;
  },

  /** "SAIR" pelo canal: registra o opt-out sem passar pelo painel. */
  async optOut(organizationId: string, contactId: string) {
    await contactsRepository.update(organizationId, contactId, { optedOutAt: new Date() });
  },

  /** Nome para mostrar em outras telas (fila da caixa de entrada). */
  async labelsFor(organizationId: string, ids: string[]) {
    const contacts = await contactsRepository.findByIds(organizationId, [...new Set(ids)]);
    return new Map(contacts.map((c) => [c.id, c.name ?? c.email ?? c.phone ?? "Contato"]));
  },

  /** Etiquetas do contato (condicao de automacao). */
  async tagIdsOf(contactId: string) {
    const tags = await taxonomyRepository.tagsOf([contactId]);
    return tags.map((t) => t.id);
  },

  /** Acao de automacao: so etiqueta da propria organizacao. */
  async addTag(organizationId: string, contactId: string, tagId: string) {
    const tags = await taxonomyRepository.listTags(organizationId);
    if (!tags.some((t) => t.id === tagId)) return false;
    await taxonomyRepository.addContactTags(contactId, [tagId]);
    return true;
  },
};
