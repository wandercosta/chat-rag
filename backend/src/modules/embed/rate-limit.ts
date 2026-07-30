import { redis } from "../../db/redis.js";

/** Janela fixa simples no Redis (INCR + EXPIRE). Suficiente para os limites
 * padrao do MVP (ADR-002 #5); pode evoluir para janela deslizante depois. */
async function hit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count <= max;
}

export const rateLimits = {
  /** 60 requisicoes/minuto por chave+IP. */
  perKeyAndIp(embedKeyId: string, ip: string) {
    return hit(`rl:req:${embedKeyId}:${ip}`, 60, 60);
  },

  /** 30 novas conversas/hora por chave+dominio. */
  newConversation(embedKeyId: string, domain: string) {
    return hit(`rl:conv:${embedKeyId}:${domain}`, 3600, 30);
  },

  /** 60 mensagens/hora por conversa. */
  messagePerConversation(conversationId: string) {
    return hit(`rl:msg:${conversationId}`, 3600, 60);
  },
};
