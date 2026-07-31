import type { FastifyInstance } from "fastify";
import { organizationsService } from "./modules/organizations/index.js";

/** `GET /organizations/:id` continua liberado de proposito: e como o painel
 * descobre que a organizacao esta suspensa para explicar isso ao usuario em vez
 * de quebrar em telas em branco. */
const SELF_LOOKUP = /^\/organizations\/[0-9a-f-]{36}\/?(\?.*)?$/i;
const ORG_SCOPED = /^\/organizations\/([0-9a-f-]{36})\//i;

/**
 * Suspensao bloqueia o painel sem apagar dados
 * (docs/database/modelo-de-dados.md - Provisionamento). Vive fora de
 * `src/modules/` porque `identity` (dono dos guards) nao pode importar
 * `organizations` — `organizations` ja importa `identity`, e o ciclo quebraria
 * a fronteira do ADR-002. As rotas `/master/*` nao passam por aqui: o Master
 * precisa continuar enxergando e reativando um tenant suspenso.
 */
export function registerTenantStatusGuard(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    if (SELF_LOOKUP.test(request.url)) return;

    const match = ORG_SCOPED.exec(request.url);
    if (!match) return;

    if (await organizationsService.isSuspended(match[1])) {
      return reply.code(403).send({ error: "organizacao suspensa" });
    }
  });
}
