import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { registerCors } from "./cors.js";
import { registerTenantStatusGuard } from "./tenant-status.js";
import { platformAiSummary } from "./config/ai.js";
import { identityPlugin, membersRoutes, requireSession } from "./modules/identity/index.js";
import {
  organizationsRoutes,
  aiCredentialsRoutes,
  supportSessionsRoutes,
} from "./modules/organizations/index.js";
import { auditRoutes } from "./modules/audit/index.js";
import { assistantsRoutes, modelCatalogRoutes, handoffRoutes } from "./modules/assistants/index.js";
import { collectionsRoutes, topicsRoutes, sourcesRoutes } from "./modules/knowledge/index.js";
import { conversationsRoutes, gapsRoutes } from "./modules/conversations/index.js";
import { ragRoutes } from "./modules/rag/index.js";
import { demoRoutes, embedAdminRoutes, embedPublicRoutes } from "./modules/embed/index.js";
import { analyticsRoutes } from "./modules/analytics/index.js";

/** Fabrica da app, separada de server.ts (que so faz `listen`), para poder
 * subir a aplicacao real em testes de integracao HTTP sem abrir uma porta —
 * ver app.integration.test.ts (regressao do bug de encapsulamento do
 * fastify-plugin, que nenhum teste unitario dos guards conseguia pegar). */
export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  registerCors(app);
  registerTenantStatusGuard(app);
  await app.register(cookie);
  await app.register(multipart);
  await app.register(identityPlugin);
  await app.register(membersRoutes);
  await app.register(organizationsRoutes);
  await app.register(aiCredentialsRoutes);
  await app.register(supportSessionsRoutes);
  await app.register(auditRoutes);
  await app.register(assistantsRoutes);
  await app.register(modelCatalogRoutes);
  await app.register(handoffRoutes);
  await app.register(collectionsRoutes);
  await app.register(topicsRoutes);
  await app.register(sourcesRoutes);
  await app.register(conversationsRoutes);
  await app.register(gapsRoutes);
  await app.register(ragRoutes);
  await app.register(embedAdminRoutes);
  await app.register(embedPublicRoutes);
  await app.register(analyticsRoutes);
  await app.register(demoRoutes);

  app.get("/health", async () => ({ ok: true }));

  // Qual IA a plataforma oferece sem chave do tenant (ADR-005). O painel usa
  // isso para nao pedir chave BYOK quando o .env ja resolve.
  app.get("/platform/ai", { preHandler: requireSession }, async () => platformAiSummary());

  return app;
}
