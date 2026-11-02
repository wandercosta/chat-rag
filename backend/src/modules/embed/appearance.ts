import { z } from "zod";
import { db } from "../../db/client.js";
import type { WidgetSettings } from "../../db/types.js";

/**
 * Aparencia do widget. A organizacao define um padrao (widget_defaults) e
 * cada assistente sobrescreve campo a campo (assistants.widget_settings); os
 * atributos data-* do <script> ainda vencem os dois no site do cliente.
 */
export const appearanceSchema = z
  .object({
    title: z.string().max(60).optional(),
    greeting: z.string().max(300).optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    position: z.enum(["bottom-right", "bottom-left"]).optional(),
    theme: z.enum(["light", "dark", "sync"]).optional(),
    // So https: a imagem carrega no site do cliente.
    logoUrl: z
      .string()
      .url()
      .max(500)
      .refine((u) => u.startsWith("https://"), "o logo precisa de endereco https")
      .optional(),
  })
  .strict();

export const widgetDefaultsRepository = {
  async get(organizationId: string): Promise<WidgetSettings> {
    const row = await db
      .selectFrom("widget_defaults")
      .select("settings")
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();
    return row?.settings ?? {};
  },

  async save(organizationId: string, settings: WidgetSettings) {
    const values = { settings: JSON.stringify(settings), updated_at: new Date().toISOString() };
    await db
      .insertInto("widget_defaults")
      .values({ organization_id: organizationId, ...values })
      .onConflict((oc) => oc.column("organization_id").doUpdateSet(values))
      .execute();
  },
};

/** Campo vazio do assistente nao apaga o padrao da organizacao. */
export function mergeAppearance(defaults: WidgetSettings, assistant: WidgetSettings | undefined) {
  const own = Object.fromEntries(
    Object.entries(assistant ?? {}).filter(([, v]) => v !== undefined && v !== ""),
  );
  return { ...defaults, ...own } as WidgetSettings;
}
