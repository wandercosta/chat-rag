import { contactsService } from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { membersService } from "../identity/index.js";
import type { TenantRole } from "../../db/types.js";
import { assignmentsRepository, type AssignmentView } from "./assignments.repository.js";
import { notesRepository } from "./notes.repository.js";
import { replyWindowEndsAt } from "./reply.js";
import { sectorsRepository } from "./sectors.repository.js";
import { settingsRepository } from "./settings.repository.js";

export type InboxView = AssignmentView | "assistente";

/** Quem pede a lista: Atendente so ve na fila o que e sem setor ou dos seus setores. */
export interface InboxViewer {
  userId: string;
  role: TenantRole | null;
}

type AssignmentRow = NonNullable<Awaited<ReturnType<typeof assignmentsRepository.find>>>;

export function isActive(row: AssignmentRow | undefined): row is AssignmentRow {
  return !!row && row.status !== "resolvida";
}

async function memberEmails(organizationId: string): Promise<Map<string, string>> {
  const members = await membersService.list(organizationId);
  return new Map(members.map((m) => [m.user_id, m.email]));
}

function toAssignment(
  row: AssignmentRow,
  emails: Map<string, string>,
  sectors: Map<string, string>,
) {
  return {
    status: row.status,
    assignedUserId: row.assigned_user_id,
    assignedUserEmail: row.assigned_user_id ? (emails.get(row.assigned_user_id) ?? null) : null,
    sectorId: row.sector_id,
    sectorName: row.sector_id ? (sectors.get(row.sector_id) ?? null) : null,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  };
}

/** Nome do contato do CRM (etapa 3) no lugar do "visitante anonimo". */
async function withContactLabels<T extends { contact_id: string | null }>(
  organizationId: string,
  conversations: T[],
) {
  const ids = conversations.flatMap((c) => (c.contact_id ? [c.contact_id] : []));
  const labels = await contactsService.labelsFor(organizationId, ids);
  return conversations.map((c) => ({
    ...c,
    contact_label: c.contact_id ? (labels.get(c.contact_id) ?? null) : null,
  }));
}

/**
 * Prazo de primeira resposta (SLA): so para conversa com humano ainda sem
 * resposta de atendente depois do pedido. `firstResponseLate` = passou do
 * prazo. Sem meta configurada, nada e calculado.
 */
async function firstResponseDeadlines(organizationId: string, rows: AssignmentRow[]) {
  const result = new Map<string, { firstResponseDueAt: Date; firstResponseLate: boolean }>();
  const { firstResponseMinutes } = await settingsRepository.get(organizationId);
  const pending = rows.filter(isActive);
  if (!firstResponseMinutes || pending.length === 0) return result;

  const replied = await conversationsService.lastAgentReplyAt(
    organizationId,
    pending.map((r) => r.conversation_id),
  );
  for (const row of pending) {
    const last = replied.get(row.conversation_id);
    if (last && last >= row.requested_at) continue;
    const dueAt = new Date(row.requested_at.getTime() + firstResponseMinutes * 60_000);
    result.set(row.conversation_id, {
      firstResponseDueAt: dueAt,
      firstResponseLate: dueAt.getTime() < Date.now(),
    });
  }
  return result;
}

/** Leitura da caixa de entrada: filas e detalhe da conversa. */
export const inboxViews = {
  async list(
    organizationId: string,
    view: InboxView,
    viewer: InboxViewer,
    filter: { sectorId?: string } = {},
  ) {
    if (view === "assistente") {
      const recent = await conversationsService.listSummaries(organizationId, {
        channel: "widget",
        limit: 100,
      });
      const withHuman = new Set(
        await assignmentsRepository.activeAmong(
          organizationId,
          recent.map((c) => c.id),
        ),
      );
      const free = recent.filter((c) => !withHuman.has(c.id)).slice(0, 50);
      return (await withContactLabels(organizationId, free)).map((c) => ({
        ...c,
        assignment: null,
      }));
    }

    // Na fila, Atendente ve o que nao tem setor e o que e dos setores dele.
    const visibleSectors =
      view === "fila" && viewer.role === "Atendente"
        ? await sectorsRepository.sectorIdsOf(organizationId, viewer.userId)
        : undefined;
    const rows = await assignmentsRepository.list(organizationId, view, viewer.userId, {
      visibleSectors,
      sectorId: filter.sectorId,
    });
    const byId = new Map(rows.map((r) => [r.conversation_id, r]));
    const [summaries, emails, sectors, sla] = await Promise.all([
      conversationsService.listSummaries(organizationId, { ids: [...byId.keys()] }),
      memberEmails(organizationId),
      sectorsRepository.namesFor(organizationId, [
        ...new Set(rows.flatMap((r) => (r.sector_id ? [r.sector_id] : []))),
      ]),
      firstResponseDeadlines(organizationId, rows),
    ]);
    return (await withContactLabels(organizationId, summaries)).map((c) => ({
      ...c,
      assignment: { ...toAssignment(byId.get(c.id)!, emails, sectors), ...sla.get(c.id) },
    }));
  },

  async get(organizationId: string, conversationId: string) {
    const conversation = await conversationsService.getWithMessages(organizationId, conversationId);
    if (!conversation) return null;

    const [row, notes, emails] = await Promise.all([
      assignmentsRepository.find(organizationId, conversationId),
      notesRepository.listFor(organizationId, conversationId),
      memberEmails(organizationId),
    ]);
    const sectors = await sectorsRepository.namesFor(
      organizationId,
      row?.sector_id ? [row.sector_id] : [],
    );
    const emailOf = (id: string | null) => (id ? (emails.get(id) ?? null) : null);
    const [withLabel] = await withContactLabels(organizationId, [conversation]);

    return {
      ...withLabel,
      messages: conversation.messages.map((m) => ({
        ...m,
        author_email: emailOf(m.author_user_id),
      })),
      assignment: row ? toAssignment(row, emails, sectors) : null,
      replyWindowEndsAt: await replyWindowEndsAt(conversation),
      notes: notes.map((n) => ({ ...n, author_email: emailOf(n.author_user_id) })),
    };
  },
};
