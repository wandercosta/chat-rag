import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Limite mensal de tokens da IA da plataforma por tenant (ADR-007).
 * padrao = PLATFORM_AI_MONTHLY_TOKENS do .env; personalizado = ai_monthly_tokens;
 * sem_limite = explicito. ai_limit_notified_month ("AAAA-MM") evita repetir o
 * e-mail de teto atingido no mesmo mes.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("organizations", {
    ai_limit_mode: {
      type: "text",
      notNull: true,
      default: "padrao",
      check: "ai_limit_mode in ('padrao', 'personalizado', 'sem_limite')",
    },
    ai_monthly_tokens: { type: "bigint", check: "ai_monthly_tokens > 0" },
    ai_limit_notified_month: { type: "text" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("organizations", [
    "ai_limit_mode",
    "ai_monthly_tokens",
    "ai_limit_notified_month",
  ]);
}
