import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Preco por modelo para o custo estimado do consumo (Master). Em dolar por
 * 1 milhao de tokens, entrada e saida separadas, como os provedores cobram.
 * Vazio = sem preco: o consumo mostra o modelo como "sem preco" em vez de
 * inventar um valor. Os tokens de cada resposta ficam no payload do evento
 * de uso (usage_events.payload.inputTokens/outputTokens/model).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("ai_model_catalog", {
    input_price_per_mtok: { type: "numeric(12,4)" },
    output_price_per_mtok: { type: "numeric(12,4)" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("ai_model_catalog", ["input_price_per_mtok", "output_price_per_mtok"]);
}
