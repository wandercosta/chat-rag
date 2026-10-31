import { auditService } from "../audit/index.js";
import { membersService } from "../identity/index.js";
import { realtime } from "../../realtime/events.js";
import type { TenantRole } from "../../db/types.js";
import { assignmentsRepository } from "./assignments.repository.js";
import { isActive } from "./inbox-views.js";
import { notesRepository } from "./notes.repository.js";
import { requireReplyable, type InboxActor } from "./reply.js";
import { sectorsRepository } from "./sectors.repository.js";

/** Atendente so transfere conversa que e dele ou que esta livre na fila. */
export class ForbiddenTransferError extends Error {}
export class InvalidTransferTargetError extends Error {}

const AGENT_ROLES: readonly TenantRole[] = ["Administrador", "Atendente"];

export interface TransferTarget {
  /** Pessoa que recebe; null = fica na fila (do setor, se houver). */
  userId?: string | null;
  /** Setor de destino; sem o campo, o setor nao muda. */
  sectorId?: string | null;
  reason?: string;
}

/**
 * Passa a conversa para outra pessoa e/ou setor. O motivo vira nota interna
 * (o cliente nao ve) e quem recebe e avisado no painel pelo tempo real.
 */
export async function transferConversation(
  actor: InboxActor,
  organizationId: string,
  conversationId: string,
  target: TransferTarget,
) {
  await requireReplyable(organizationId, conversationId);
  const current = await assignmentsRepository.find(organizationId, conversationId);
  const active = isActive(current);

  const owner = active ? current.assigned_user_id : null;
  if (actor.role !== "Administrador" && owner && owner !== actor.userId) {
    throw new ForbiddenTransferError();
  }

  let toEmail: string | null = null;
  if (target.userId) {
    const members = await membersService.list(organizationId);
    const member = members.find((m) => m.user_id === target.userId);
    if (!member || !AGENT_ROLES.includes(member.role)) throw new InvalidTransferTargetError();
    toEmail = member.email;
  }
  const sector = target.sectorId
    ? await sectorsRepository.find(organizationId, target.sectorId)
    : null;
  if (target.sectorId && !sector) throw new InvalidTransferTargetError();

  // So setor: a conversa volta para a fila daquele setor.
  const assignedUserId =
    target.userId !== undefined ? target.userId : target.sectorId !== undefined ? null : owner;
  const row = await assignmentsRepository.upsert(organizationId, conversationId, {
    status: active ? current.status : "aberta",
    assignedUserId,
    ...(target.sectorId !== undefined && { sectorId: target.sectorId }),
  });

  const destination = [
    toEmail ?? (assignedUserId ? null : "fila"),
    sector ? `setor ${sector.name}` : target.sectorId === null ? "sem setor" : null,
  ]
    .filter(Boolean)
    .join(", ");
  await notesRepository.insert(
    organizationId,
    conversationId,
    actor.userId,
    `Transferiu a conversa para ${destination}.${target.reason ? ` Motivo: ${target.reason}` : ""}`,
  );
  await auditService.record({
    actorUserId: actor.userId,
    organizationId,
    action: "Transferiu conversa",
    type: "conteudo",
    target: conversationId,
  });

  await realtime.publish(organizationId, { kind: "conversation_changed", conversationId });
  await realtime.publish(organizationId, {
    kind: "transfer",
    conversationId,
    byUserId: actor.userId,
    toUserId: assignedUserId,
    toSectorId: row.sector_id,
  });
  return row;
}
