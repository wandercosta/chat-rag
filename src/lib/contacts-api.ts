/** CRM de contatos (ADR-006, etapa 3; docs/apis/contratos-planejados.md). */
import { API_BASE_URL, ApiError, apiFetch } from "./api-client";

export interface ContactTag {
  id: string;
  name: string;
  color: string;
}

export interface ContactField {
  id: string;
  key: string;
  label: string;
  type: "texto" | "numero" | "data";
}

export interface ContactFilter {
  search?: string;
  tagIds?: string[];
  tagMatch?: "any" | "all";
  optIn?: boolean;
  fields?: { key: string; value: string }[];
}

export interface ContactSegment {
  id: string;
  name: string;
  filter: ContactFilter;
}

export interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  custom_fields: Record<string, string>;
  opt_in_at: string | null;
  opt_in_source: string | null;
  opted_out_at: string | null;
  created_at: string;
  updated_at: string;
  tags: ContactTag[];
}

export interface ContactDetail extends Contact {
  identities: { id: string; channel: string; value: string; created_at: string }[];
  conversations: {
    id: string;
    channel: string;
    started_at: string;
    last_message: { role: string; content: string; created_at: string } | null;
    last_activity_at: string;
  }[];
}

export interface ContactInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  optIn?: boolean;
  customFields?: Record<string, string>;
  tagIds?: string[];
}

export interface ImportReport {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
  ignoredColumns: string[];
}

export interface ContactListQuery {
  search?: string;
  tagIds?: string[];
  optIn?: boolean;
  segmentId?: string;
  page?: number;
}

/** Opt-in valido = marcado e sem opt-out depois. */
export function isOptedIn(contact: Pick<Contact, "opt_in_at" | "opted_out_at">) {
  return !!contact.opt_in_at && !contact.opted_out_at;
}

export function contactLabel(contact: Pick<Contact, "name" | "email" | "phone">) {
  return contact.name ?? contact.email ?? contact.phone ?? "Contato sem nome";
}

function toQueryString(query: ContactListQuery) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.tagIds?.length) params.set("tagIds", query.tagIds.join(","));
  if (query.optIn !== undefined) params.set("optIn", String(query.optIn));
  if (query.segmentId) params.set("segmentId", query.segmentId);
  if (query.page) params.set("page", String(query.page));
  return params.toString();
}

const base = (organizationId: string) => `/organizations/${organizationId}`;
const send = <T>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const contactsApi = {
  list: (organizationId: string, query: ContactListQuery) =>
    apiFetch<{ items: Contact[]; total: number; page: number; pageSize: number }>(
      `${base(organizationId)}/contacts?${toQueryString(query)}`,
    ),
  get: (organizationId: string, id: string) =>
    apiFetch<ContactDetail>(`${base(organizationId)}/contacts/${id}`),
  create: (organizationId: string, input: ContactInput) =>
    send<Contact>("POST", `${base(organizationId)}/contacts`, input),
  update: (organizationId: string, id: string, input: ContactInput) =>
    send<Contact>("PATCH", `${base(organizationId)}/contacts/${id}`, input),
  remove: (organizationId: string, id: string) =>
    send<void>("DELETE", `${base(organizationId)}/contacts/${id}`),
  fromConversation: (organizationId: string, conversationId: string, input: ContactInput) =>
    send<{ contact: Contact; merged: boolean }>(
      "POST",
      `${base(organizationId)}/contacts/from-conversation`,
      { conversationId, ...input },
    ),
  importCsv: (organizationId: string, csv: string) =>
    send<ImportReport>("POST", `${base(organizationId)}/contacts/import`, { csv }),

  /** Baixa o CSV com o cookie de sessao (um link simples nao levaria o filtro). */
  async exportCsv(organizationId: string, query: ContactListQuery) {
    const response = await fetch(
      `${API_BASE_URL}${base(organizationId)}/contacts/export?${toQueryString(query)}`,
      { credentials: "include" },
    );
    if (!response.ok) throw new ApiError(response.status, "nao foi possivel exportar");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "contatos.csv";
    link.click();
    URL.revokeObjectURL(url);
  },
};

export const contactTaxonomyApi = {
  tags: (organizationId: string) => apiFetch<ContactTag[]>(`${base(organizationId)}/contact-tags`),
  createTag: (organizationId: string, name: string) =>
    send<ContactTag>("POST", `${base(organizationId)}/contact-tags`, { name }),
  removeTag: (organizationId: string, id: string) =>
    send<void>("DELETE", `${base(organizationId)}/contact-tags/${id}`),
  fields: (organizationId: string) =>
    apiFetch<ContactField[]>(`${base(organizationId)}/contact-fields`),
  createField: (organizationId: string, label: string, type: ContactField["type"]) =>
    send<ContactField>("POST", `${base(organizationId)}/contact-fields`, { label, type }),
  removeField: (organizationId: string, id: string) =>
    send<void>("DELETE", `${base(organizationId)}/contact-fields/${id}`),
  segments: (organizationId: string) =>
    apiFetch<ContactSegment[]>(`${base(organizationId)}/contact-segments`),
  createSegment: (organizationId: string, name: string, filter: ContactFilter) =>
    send<ContactSegment>("POST", `${base(organizationId)}/contact-segments`, { name, filter }),
  removeSegment: (organizationId: string, id: string) =>
    send<void>("DELETE", `${base(organizationId)}/contact-segments/${id}`),
};
