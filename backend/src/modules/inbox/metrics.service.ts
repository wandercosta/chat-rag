import { conversationsService } from "../conversations/index.js";
import { membersService } from "../identity/index.js";
import { assignmentsRepository } from "./assignments.repository.js";
import { settingsRepository } from "./settings.repository.js";

export interface AgentMetrics {
  userId: string;
  email: string;
  /** Conversas que pediram humano no periodo e estao com esta pessoa. */
  assigned: number;
  /** Conversas com esta pessoa marcadas como resolvidas no periodo. */
  resolved: number;
  messagesSent: number;
  /** Do pedido de atendimento ate a primeira resposta desta pessoa, em segundos. */
  firstResponseMedianSeconds: number | null;
  firstResponseAverageSeconds: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

const average = (values: number[]) =>
  values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

/**
 * Metricas por atendente (etapa 8). Tempo de primeira resposta: do pedido de
 * atendimento humano ate a primeira mensagem de atendente depois dele; conta
 * para quem respondeu primeiro.
 */
export async function agentMetrics(organizationId: string, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [members, assignments, replies, settings] = await Promise.all([
    membersService.list(organizationId),
    assignmentsRepository.touchedSince(organizationId, since),
    conversationsService.agentRepliesSince(organizationId, since),
    settingsRepository.get(organizationId),
  ]);
  const slaSeconds = settings.firstResponseMinutes ? settings.firstResponseMinutes * 60 : null;

  const byUser = new Map<
    string,
    { assigned: number; resolved: number; sent: number; frt: number[] }
  >();
  const stats = (userId: string) => {
    let s = byUser.get(userId);
    if (!s) byUser.set(userId, (s = { assigned: 0, resolved: 0, sent: 0, frt: [] }));
    return s;
  };

  for (const a of assignments) {
    if (!a.assigned_user_id) continue;
    if (a.requested_at >= since) stats(a.assigned_user_id).assigned++;
    if (a.status === "resolvida" && a.updated_at >= since) stats(a.assigned_user_id).resolved++;
  }

  const repliesByConversation = new Map<string, typeof replies>();
  for (const r of replies) {
    stats(r.userId).sent += r.count;
    const list = repliesByConversation.get(r.conversationId) ?? [];
    list.push(r);
    repliesByConversation.set(r.conversationId, list);
  }
  const sla = { met: 0, total: 0 };
  for (const a of assignments) {
    if (a.requested_at < since) continue;
    const first = (repliesByConversation.get(a.conversation_id) ?? [])
      .filter((r) => r.firstAt >= a.requested_at)
      .sort((x, y) => x.firstAt.getTime() - y.firstAt.getTime())[0];
    if (first) {
      stats(first.userId).frt.push((first.firstAt.getTime() - a.requested_at.getTime()) / 1000);
    }
    // SLA: conta quem ja foi respondido ou ja estourou o prazo sem resposta.
    if (slaSeconds) {
      const waited = ((first?.firstAt ?? new Date()).getTime() - a.requested_at.getTime()) / 1000;
      if (first || waited > slaSeconds) {
        sla.total++;
        if (first && waited <= slaSeconds) sla.met++;
      }
    }
  }

  const agents: AgentMetrics[] = members
    .filter((m) => m.role === "Administrador" || m.role === "Atendente")
    .map((m) => {
      const s = byUser.get(m.user_id) ?? { assigned: 0, resolved: 0, sent: 0, frt: [] };
      return {
        userId: m.user_id,
        email: m.email,
        assigned: s.assigned,
        resolved: s.resolved,
        messagesSent: s.sent,
        firstResponseMedianSeconds: median(s.frt),
        firstResponseAverageSeconds: average(s.frt),
      };
    })
    .sort((a, b) => b.resolved - a.resolved || b.messagesSent - a.messagesSent);

  const allFrt = [...byUser.values()].flatMap((s) => s.frt);
  return {
    days,
    since,
    team: {
      requests: assignments.filter((a) => a.requested_at >= since).length,
      waiting: assignments.filter((a) => a.status !== "resolvida" && !a.assigned_user_id).length,
      resolved: agents.reduce((sum, a) => sum + a.resolved, 0),
      firstResponseMedianSeconds: median(allFrt),
      firstResponseSlaMinutes: settings.firstResponseMinutes,
      /** Pedidos ja respondidos (ou estourados) e quantos dentro do prazo. */
      sla: slaSeconds ? sla : null,
    },
    agents,
  };
}
