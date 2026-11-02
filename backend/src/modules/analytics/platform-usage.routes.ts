import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMaster, requireSession } from "../identity/index.js";
import { platformUsage } from "./platform-usage.service.js";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

/** Consumo cruzando tenants, para a visao geral da plataforma (so Master). */
export async function platformUsageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get("/master/usage", { preHandler: requireMaster }, async (request) => {
    const { days } = querySchema.parse(request.query);
    return platformUsage(days);
  });
}
