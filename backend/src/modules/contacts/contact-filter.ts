import { z } from "zod";
import type { ContactFilter } from "../../db/types.js";

/** Filtro salvo num segmento (corpo JSON). */
export const contactFilterSchema = z
  .object({
    search: z.string().max(200).optional(),
    tagIds: z.array(z.string().uuid()).max(50).optional(),
    tagMatch: z.enum(["any", "all"]).optional(),
    optIn: z.boolean().optional(),
    fields: z
      .array(z.object({ key: z.string().min(1).max(80), value: z.string().max(500) }))
      .max(20)
      .optional(),
  })
  .strict();

/** O mesmo filtro vindo da query string da lista e da exportacao. */
export const contactQuerySchema = z.object({
  search: z.string().max(200).optional(),
  tagIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : undefined))
    .pipe(z.array(z.string().uuid()).max(50).optional()),
  tagMatch: z.enum(["any", "all"]).optional(),
  optIn: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  segmentId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().max(10_000).optional(),
});

/** O segmento e a base; filtros da tela restringem por cima dele. */
export function mergeFilters(segment: ContactFilter | null, query: ContactFilter): ContactFilter {
  if (!segment) return query;
  return {
    ...segment,
    ...(query.search && { search: query.search }),
    ...(query.optIn !== undefined && { optIn: query.optIn }),
    ...(query.tagIds?.length && {
      tagIds: [...new Set([...(segment.tagIds ?? []), ...query.tagIds])],
      tagMatch: "all" as const,
    }),
  };
}
