import { auditService } from "../audit/index.js";
import type { ContactFilter } from "../../db/types.js";
import { contactsRepository, type ContactValues } from "./contacts.repository.js";
import { insertContact } from "./created.js";
import { parseCsv, toCsv } from "./csv.js";
import { isTruthy, normalizeEmail, normalizeKey, normalizePhone } from "./normalize.js";
import { taxonomyRepository } from "./taxonomy.repository.js";

/** Teto por arquivo: importacao roda na requisicao, nao em fila. */
export const MAX_IMPORT_ROWS = 5000;

export class ImportTooLargeError extends Error {}
export class ImportWithoutContactColumnError extends Error {}

const COLUMN_ALIASES: Record<string, "name" | "email" | "phone" | "tags" | "optIn"> = {
  nome: "name",
  name: "name",
  email: "email",
  e_mail: "email",
  telefone: "phone",
  phone: "phone",
  celular: "phone",
  whatsapp: "phone",
  etiquetas: "tags",
  tags: "tags",
  opt_in: "optIn",
  optin: "optIn",
  aceita_campanhas: "optIn",
};

export interface ImportReport {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
  ignoredColumns: string[];
}

/**
 * Importacao de CSV (etapa 3). Atualiza por e-mail e depois por telefone;
 * cada linha com problema entra no relatorio com o numero da linha (a 1 e o
 * cabecalho) e o resto segue. Opt-in so e marcado, nunca desfeito, pela
 * importacao: quem pediu para sair nao volta por uma planilha.
 */
export async function importContacts(
  actorUserId: string,
  organizationId: string,
  csv: string,
): Promise<ImportReport> {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return { created: 0, updated: 0, errors: [], ignoredColumns: [] };
  if (rows.length > MAX_IMPORT_ROWS) throw new ImportTooLargeError();

  const fields = await taxonomyRepository.listFields(organizationId);
  const fieldByKey = new Map(
    fields.flatMap((f) => [
      [f.key, f.key],
      [normalizeKey(f.label), f.key],
    ]),
  );

  const columns = header.map((raw) => {
    const key = normalizeKey(raw);
    if (COLUMN_ALIASES[key]) return { kind: COLUMN_ALIASES[key] } as const;
    if (fieldByKey.has(key)) return { kind: "field", key: fieldByKey.get(key)! } as const;
    return { kind: "ignored", raw } as const;
  });
  if (!columns.some((c) => c.kind === "email" || c.kind === "phone")) {
    throw new ImportWithoutContactColumnError();
  }

  const report: ImportReport = {
    created: 0,
    updated: 0,
    errors: [],
    ignoredColumns: columns.flatMap((c) => (c.kind === "ignored" ? [c.raw] : [])),
  };
  const tagCache = new Map<string, string>();

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const cell = (kind: string) => row[columns.findIndex((c) => c.kind === kind)]?.trim() ?? "";

    const rawEmail = cell("email");
    const rawPhone = cell("phone");
    const email = normalizeEmail(rawEmail);
    const phone = normalizePhone(rawPhone);
    if (rawEmail && !email) {
      report.errors.push({ line, message: `e-mail invalido: ${rawEmail}` });
      continue;
    }
    if (rawPhone && !phone) {
      report.errors.push({ line, message: `telefone invalido: ${rawPhone}` });
      continue;
    }
    if (!email && !phone) {
      report.errors.push({ line, message: "sem e-mail nem telefone" });
      continue;
    }

    const byEmail = email ? await contactsRepository.findByEmail(organizationId, email) : undefined;
    const byPhone = phone ? await contactsRepository.findByPhone(organizationId, phone) : undefined;
    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      report.errors.push({ line, message: "e-mail e telefone pertencem a contatos diferentes" });
      continue;
    }
    const existing = byEmail ?? byPhone;

    const customFields: Record<string, string> = { ...(existing?.custom_fields ?? {}) };
    columns.forEach((c, i) => {
      const value = row[i]?.trim();
      if (c.kind === "field" && value) customFields[c.key] = value;
    });

    const name = cell("name");
    const values: ContactValues = {
      ...(name && { name }),
      ...(email && { email }),
      ...(phone && { phone }),
      customFields,
    };
    const optedIn = !!existing?.opt_in_at && !existing.opted_out_at;
    if (isTruthy(cell("optIn")) && !optedIn && !existing?.opted_out_at) {
      Object.assign(values, { optInAt: new Date(), optInSource: "importacao" });
    }

    const contact = existing
      ? await contactsRepository.update(organizationId, existing.id, values)
      : await insertContact(organizationId, values);
    if (existing) report.updated++;
    else report.created++;

    const tagNames = cell("tags")
      .split(/[|,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const tagIds: string[] = [];
    for (const tagName of tagNames) {
      if (!tagCache.has(tagName)) {
        tagCache.set(tagName, (await taxonomyRepository.ensureTag(organizationId, tagName)).id);
      }
      tagIds.push(tagCache.get(tagName)!);
    }
    await taxonomyRepository.addContactTags(contact!.id, tagIds);
  }

  await auditService.record({
    actorUserId,
    organizationId,
    action: `Importou contatos (${report.created} novos, ${report.updated} atualizados, ${report.errors.length} com erro)`,
    type: "conteudo",
    target: "contatos",
  });
  return report;
}

/** Exportacao (LGPD e uso fora do produto): auditada, porque leva dado pessoal. */
export async function exportContacts(
  actorUserId: string,
  organizationId: string,
  filter: ContactFilter,
): Promise<string> {
  const [contacts, fields] = await Promise.all([
    contactsRepository.listAll(organizationId, filter),
    taxonomyRepository.listFields(organizationId),
  ]);
  const tags = await taxonomyRepository.tagsOf(contacts.map((c) => c.id));

  const header = [
    "nome",
    "email",
    "telefone",
    "etiquetas",
    "opt_in",
    "opt_in_origem",
    "criado_em",
    ...fields.map((f) => f.key),
  ];
  const rows = contacts.map((c) => [
    c.name ?? "",
    c.email ?? "",
    c.phone ?? "",
    tags
      .filter((t) => t.contact_id === c.id)
      .map((t) => t.name)
      .join("|"),
    c.opt_in_at && !c.opted_out_at ? "sim" : "nao",
    c.opt_in_source ?? "",
    new Date(c.created_at).toISOString(),
    ...fields.map((f) => c.custom_fields?.[f.key] ?? ""),
  ]);

  await auditService.record({
    actorUserId,
    organizationId,
    action: `Exportou ${contacts.length} contato(s)`,
    type: "seguranca",
    target: "contatos",
  });
  return toCsv(header, rows);
}
