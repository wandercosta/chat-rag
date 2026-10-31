import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { ModelNotAllowedError, assistantsService } from "./assistants.service.js";

const roles = ["Administrador", "Editor de base"] as const;

const createSchema = z.object({
  name: z.string().min(2),
  modelId: z.string().min(1),
  instructions: z.string().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  status: z.enum(["publicado", "rascunho", "pausado"]).optional(),
  modelId: z.string().min(1).optional(),
  instructions: z.string().nullable().optional(),
  retentionDays: z.number().int().positive().nullable().optional(),
  // Pedido de atendente no widget cai na caixa de entrada do painel (ADR-006).
  humanInboxEnabled: z.boolean().optional(),
  // So trechos de fontes revisadas por uma pessoa (sources.reviewed_at).
  reviewedSourcesOnly: z.boolean().optional(),
  widgetSettings: z
    .object({
      title: z.string().max(60).optional(),
      greeting: z.string().max(300).optional(),
      accentColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      position: z.enum(["bottom-right", "bottom-left"]).optional(),
      theme: z.enum(["light", "dark", "sync"]).optional(),
      // Mesmo formato do padrao da organizacao (embed/appearance.ts).
      logoUrl: z
        .string()
        .url()
        .max(500)
        .refine((u) => u.startsWith("https://"), "o logo precisa de endereco https")
        .optional(),
    })
    .strict()
    .optional(),
});

export async function assistantsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/assistants",
    { preHandler: requireOrgRole([...roles, "Analista"]) },
    async (request) => {
      return assistantsService.list(request.params.organizationId);
    },
  );

  app.get<{ Params: { organizationId: string; assistantId: string } }>(
    "/organizations/:organizationId/assistants/:assistantId",
    { preHandler: requireOrgRole([...roles, "Analista"]) },
    async (request, reply) => {
      const assistant = await assistantsService.get(
        request.params.organizationId,
        request.params.assistantId,
      );
      if (!assistant) return reply.code(404).send({ error: "assistente nao encontrado" });
      return assistant;
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/assistants",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      try {
        const assistant = await assistantsService.create(
          request.auth!.userId,
          request.params.organizationId,
          body,
        );
        return reply.code(201).send(assistant);
      } catch (err) {
        if (err instanceof ModelNotAllowedError) {
          return reply
            .code(422)
            .send({ error: "modelo nao esta na lista liberada para esta organizacao" });
        }
        throw err;
      }
    },
  );

  app.patch<{ Params: { organizationId: string; assistantId: string } }>(
    "/organizations/:organizationId/assistants/:assistantId",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = updateSchema.parse(request.body);
      try {
        const assistant = await assistantsService.update(
          request.auth!.userId,
          request.params.organizationId,
          request.params.assistantId,
          body,
        );
        if (!assistant) return reply.code(404).send({ error: "assistente nao encontrado" });
        return assistant;
      } catch (err) {
        if (err instanceof ModelNotAllowedError) {
          return reply
            .code(422)
            .send({ error: "modelo nao esta na lista liberada para esta organizacao" });
        }
        throw err;
      }
    },
  );
}
