import type { Redis } from "ioredis";
import { redis } from "../db/redis.js";
import type { InboxStatus } from "../db/types.js";

/**
 * Eventos da caixa de entrada (ADR-006 #10) e do chat interno da equipe. Viajam pelo Redis para chegar a
 * qualquer instancia da API que tenha um painel ou widget conectado, num canal
 * por organizacao: um evento nunca e publicado no canal de outro tenant.
 *
 * Conteudo de nota interna nunca entra num evento; so a resposta do atendente
 * (que o visitante vai ler de qualquer jeito) e o status.
 */
export type InboxEvent =
  | { kind: "conversation_changed"; conversationId: string }
  | { kind: "agent_message"; conversationId: string; content: string; createdAt: string }
  | { kind: "status"; conversationId: string; status: InboxStatus }
  /** Conversa entrou na fila (pedido de atendente): som/aviso de quem atende. */
  | { kind: "queued"; conversationId: string; sectorId: string | null }
  /** Cliente escreveu numa conversa com humano: aviso de quem esta com ela. */
  | { kind: "visitor_message"; conversationId: string; assignedUserId: string | null }
  /** Conversa transferida: o painel de quem recebe (pessoa ou setor) avisa. */
  | {
      kind: "transfer";
      conversationId: string;
      byUserId: string;
      toUserId: string | null;
      toSectorId: string | null;
    }
  /** Chat interno da equipe: so ids. `participants` null = canal Geral; numa
   * conversa direta, so as duas pessoas recebem o evento. */
  | {
      kind: "team_message";
      threadId: string;
      authorUserId: string;
      participants: [string, string] | null;
    };

type Listener = (event: InboxEvent) => void;

const channelFor = (organizationId: string) => `inbox:${organizationId}`;

let subscriber: Redis | null = null;
const listeners = new Map<string, Set<Listener>>();

/** Conexao dedicada: uma conexao em modo subscribe nao aceita outros comandos. */
function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = redis.duplicate();
    subscriber.on("message", (channel: string, raw: string) => {
      const set = listeners.get(channel);
      if (!set) return;
      let event: InboxEvent;
      try {
        event = JSON.parse(raw) as InboxEvent;
      } catch {
        return;
      }
      for (const listener of set) listener(event);
    });
  }
  return subscriber;
}

export const realtime = {
  /** Melhor esforco: o banco e a fonte de verdade e o painel recarrega ao
   * reconectar. Falha do Redis aqui nao pode derrubar a resposta ao visitante. */
  async publish(organizationId: string, event: InboxEvent): Promise<void> {
    try {
      await redis.publish(channelFor(organizationId), JSON.stringify(event));
    } catch {
      // sem tempo real nesta mensagem; a proxima leitura do painel a traz.
    }
  },

  /** Devolve a funcao que cancela a inscricao. */
  async subscribe(organizationId: string, listener: Listener): Promise<() => Promise<void>> {
    const channel = channelFor(organizationId);
    let set = listeners.get(channel);
    if (!set) {
      set = new Set();
      listeners.set(channel, set);
      await getSubscriber().subscribe(channel);
    }
    set.add(listener);

    return async () => {
      const current = listeners.get(channel);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        listeners.delete(channel);
        try {
          await subscriber?.unsubscribe(channel);
        } catch {
          // conexao ja fechada: nao ha inscricao para desfazer.
        }
      }
    };
  },

  async close(): Promise<void> {
    if (subscriber) await subscriber.quit();
    subscriber = null;
    listeners.clear();
  },
};
