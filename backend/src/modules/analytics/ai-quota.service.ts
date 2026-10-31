import { env } from "../../config/env.js";
import { organizationsService } from "../organizations/index.js";
import { notifyAdminsLimitReached } from "./ai-quota-email.js";
import { usageRepository } from "./usage.repository.js";

/** Mes civil em UTC: o teto zera no dia 1. */
function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, key: start.toISOString().slice(0, 7) };
}

/**
 * Limite mensal de tokens da IA da plataforma por tenant (ADR-007). So conta
 * resposta paga pela chave do .env; a chave BYOK do tenant fica fora.
 */
export const aiQuotaService = {
  async get(organizationId: string) {
    const { mode, tokens } = await organizationsService.getAiLimit(organizationId);
    const limit =
      mode === "sem_limite"
        ? null
        : mode === "personalizado"
          ? tokens
          : (env.PLATFORM_AI_MONTHLY_TOKENS ?? null);
    const { start, end } = monthBounds();
    const used = await usageRepository.platformTokensSince(organizationId, start);
    return {
      mode,
      customTokens: tokens,
      platformDefault: env.PLATFORM_AI_MONTHLY_TOKENS ?? null,
      limit,
      used,
      exceeded: limit !== null && used >= limit,
      periodStart: start.toISOString(),
      resetsAt: end.toISOString(),
    };
  },

  /** Antes de chamar o modelo com a chave da plataforma. */
  async isExhausted(organizationId: string) {
    return (await this.get(organizationId)).exceeded;
  },

  /** Primeira resposta acima do teto no mes: avisa os administradores uma vez. */
  async noticeLimitReached(organizationId: string) {
    try {
      if (await organizationsService.claimLimitNotice(organizationId, monthBounds().key)) {
        await notifyAdminsLimitReached(organizationId);
      }
    } catch (err) {
      console.error("falha ao avisar limite de IA atingido:", err);
    }
  },
};
