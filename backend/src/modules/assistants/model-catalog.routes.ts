import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMaster, requireOrgRole, requireSession } from "../identity/index.js";
import { modelCatalogRepository } from "./model-catalog.repository.js";

const upsertSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  note: z.string().nullable().optional(),
});

const enabledSchema = z.object({ enabled: z.boolean() });
const priceSchema = z.object({
  inputPerMTok: z.number().min(0).max(10_000).nullable(),
  outputPerMTok: z.number().min(0).max(10_000).nullable(),
});
const allowedModelsSchema = z.object({ modelIds: z.array(z.string()) });

export async function modelCatalogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get("/master/model-catalog", { preHandler: requireMaster }, async () => {
    return modelCatalogRepository.listAll();
  });

  app.post("/master/model-catalog", { preHandler: requireMaster }, async (request, reply) => {
    const body = upsertSchema.parse(request.body);
    const row = await modelCatalogRepository.upsert(body.id, body.label, body.note ?? null);
    return reply.code(201).send(row);
  });

  app.patch<{ Params: { modelId: string } }>(
    "/master/model-catalog/:modelId",
    { preHandler: requireMaster },
    async (request) => {
      const body = enabledSchema.parse(request.body);
      await modelCatalogRepository.setEnabled(request.params.modelId, body.enabled);
      return { ok: true };
    },
  );

  // Preco por modelo para o custo estimado do consumo (so o Master).
  app.put<{ Params: { modelId: string } }>(
    "/master/model-catalog/:modelId/price",
    { preHandler: requireMaster },
    async (request) => {
      const body = priceSchema.parse(request.body);
      const modelId = z.string().min(1).max(100).parse(request.params.modelId);
      return modelCatalogRepository.setPrice(modelId, body.inputPerMTok, body.outputPerMTok);
    },
  );

  app.get<{ Params: { organizationId: string } }>(
    "/master/tenants/:organizationId/allowed-models",
    { preHandler: requireMaster },
    async (request) => {
      return modelCatalogRepository.listAllowedForTenant(request.params.organizationId);
    },
  );

  app.put<{ Params: { organizationId: string } }>(
    "/master/tenants/:organizationId/allowed-models",
    { preHandler: requireMaster },
    async (request) => {
      const body = allowedModelsSchema.parse(request.body);
      await modelCatalogRepository.replaceAllowedForTenant(
        request.params.organizationId,
        body.modelIds,
      );
      return { ok: true };
    },
  );

  // Leitura tenant-side: qualquer papel autorizado na organizacao ve os modelos liberados.
  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/allowed-models",
    { preHandler: requireOrgRole(["Administrador", "Editor de base", "Analista"]) },
    async (request) => {
      return modelCatalogRepository.listAllowedForTenant(request.params.organizationId);
    },
  );
}
