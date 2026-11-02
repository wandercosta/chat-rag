import { membersService } from "../identity/index.js";
import { realtime } from "../../realtime/events.js";
import type { TenantRole } from "../../db/types.js";
import { assignmentsRepository } from "./assignments.repository.js";
import { notesRepository } from "./notes.repository.js";

const AGENT_ROLES: readonly TenantRole[] = ["Administrador", "Atendente"];

export class InvalidSystemAssigneeError extends Error {}

/**
 * Acoes da caixa de entrada feitas por uma automacao (ADR-006 #4), sem pessoa
 * logada. Quem responde pela regra e quem a publicou: isso fica no historico
 * de execucoes da automacao, nao aqui.
 */
export const inboxSystemActions = {
  /** Atribui a quem atende; `null` devolve a conversa para a fila. */
  async assignBySystem(organizationId: string, conversationId: string, userId: string | null) {
    if (userId) {
      const role = await membersService.roleOf(organizationId, userId);
      if (!role || !AGENT_ROLES.includes(role)) throw new InvalidSystemAssigneeError();
    }
    const current = await assignmentsRepository.find(organizationId, conversationId);
    const active = !!current && current.status !== "resolvida";
    await assignmentsRepository.upsert(organizationId, conversationId, {
      status: active ? current.status : "aberta",
      assignedUserId: userId,
      newRequest: !active,
    });
    await realtime.publish(organizationId, { kind: "conversation_changed", conversationId });
  },

  /** Nota interna sem autor humano (aparece como "automacao" no painel). */
  async addSystemNote(organizationId: string, conversationId: string, content: string) {
    await notesRepository.insert(organizationId, conversationId, null, content);
    await realtime.publish(organizationId, { kind: "conversation_changed", conversationId });
  },

  /** Conversas com humano e ainda abertas (varredura do "sem resposta"). */
  activeAssignments(organizationId: string) {
    return assignmentsRepository.list(organizationId, "abertas", "", { limit: 500 });
  },

  /** Retencao em modo "anonimizar": notas internas podem citar o cliente. */
  deleteNotesFor(organizationId: string, conversationIds: string[]) {
    return notesRepository.deleteFor(organizationId, conversationIds);
  },

  /** Notas internas da organizacao (exportacao LGPD). */
  exportNotes(organizationId: string) {
    return notesRepository.listForOrganization(organizationId);
  },
};
