import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Widget (backlog da Fase 3):
 * - embed_keys.identity_secret: segredo para o backend do cliente assinar o
 *   token de identidade do visitante (HS256). Envelope cifrado: precisa
 *   voltar a texto para conferir a assinatura; o texto aparece uma vez so.
 *   `require_signed_identity` faz a chave ignorar identidade sem assinatura.
 * - visitors.identity_verified: o visitante veio de um token assinado. So ele
 *   retoma a conversa anterior com o historico, e uma identidade sem
 *   assinatura nunca sobrescreve a de um visitante verificado.
 * - widget_defaults: aparencia padrao do widget da organizacao; a do
 *   assistente (assistants.widget_settings) sobrescreve campo a campo.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("embed_keys", {
    identity_secret: { type: "jsonb" },
    identity_secret_hint: { type: "text" },
    require_signed_identity: { type: "boolean", notNull: true, default: false },
  });
  pgm.addColumn("visitors", {
    identity_verified: { type: "boolean", notNull: true, default: false },
  });
  pgm.createTable("widget_defaults", {
    organization_id: {
      type: "uuid",
      primaryKey: true,
      references: "organizations",
      onDelete: "cascade",
    },
    settings: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("widget_defaults");
  pgm.dropColumn("visitors", "identity_verified");
  pgm.dropColumn("embed_keys", [
    "identity_secret",
    "identity_secret_hint",
    "require_signed_identity",
  ]);
}
