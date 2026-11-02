import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Verificacao em duas etapas por aplicativo autenticador (TOTP, RFC 6238),
 * etapa 8 da Fase 3 (ADR-006).
 *
 * - totp_secret: segredo confirmado, num envelope cifrado (mesmo esquema da
 *   chave de IA); totp_pending: segredo gerado e ainda nao confirmado.
 * - recovery_codes: hashes dos codigos de recuperacao (o texto so aparece
 *   uma vez, ao ativar); cada um vale uma vez.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("users", {
    totp_secret: { type: "jsonb" },
    totp_pending: { type: "jsonb" },
    totp_enabled_at: { type: "timestamptz" },
    recovery_codes: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("users", ["totp_secret", "totp_pending", "totp_enabled_at", "recovery_codes"]);
}
