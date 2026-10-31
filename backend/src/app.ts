import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
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
import {
  demoRoutes,
  embedAdminRoutes,
  embedPublicEventsRoutes,
  embedPublicRoutes,
} from "./modules/embed/index.js";
import {
  agentMetricsRoutes,
  cannedResponsesRoutes,
  inboxRoutes,
  inboxSettingsRoutes,
  sectorsRoutes,
  setReplyWindowPolicy,
} from "./modules/inbox/index.js";
import { contactTaxonomyRoutes, contactsRoutes } from "./modules/contacts/index.js";
import {
  channelsRoutes,
  channelsWebhookRoutes,
  replyWindowHours,
} from "./modules/channels/index.js";
import { campaignsRoutes } from "./modules/campaigns/index.js";
import { automationsRoutes } from "./modules/automations/index.js";
import { privacyRoutes } from "./modules/privacy/index.js";
import { webhooksRoutes } from "./modules/webhooks/index.js";
import { teamChatRoutes } from "./modules/team-chat/index.js";
import { apiTokensRoutes, publicApiV1Routes } from "./modules/public-api/index.js";
import { aiQuotaRoutes, analyticsRoutes, platformUsageRoutes } from "./modules/analytics/index.js";

/** Fabrica da app, separada de server.ts (que so faz `listen`), para poder
 * subir a aplicacao real em testes de integracao HTTP sem abrir uma porta —
 * ver app.integration.test.ts (regressao do bug de encapsulamento do
 * fastify-plugin, que nenhum teste unitario dos guards conseguia pegar). */
export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  // As rotas validam com zod (`schema.parse`). Sem isto, dado invalido virava
  // 500 sem explicacao; agora e 400 com o motivo do primeiro problema, que o
  // painel mostra como mensagem de erro.
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const where = first?.path.length ? `${first.path.join(".")}: ` : "";
      return reply.code(400).send({
        error: first ? `${where}${first.message}` : "dados invalidos",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return reply.send(err);
  });

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
  await app.register(embedPublicEventsRoutes);
  // A janela de resposta depende da conexao do canal (tag "Agente humano").
  setReplyWindowPolicy(replyWindowHours);
  await app.register(inboxRoutes);
  await app.register(sectorsRoutes);
  await app.register(inboxSettingsRoutes);
  await app.register(cannedResponsesRoutes);
  await app.register(agentMetricsRoutes);
  await app.register(contactsRoutes);
  await app.register(contactTaxonomyRoutes);
  await app.register(channelsRoutes);
  await app.register(channelsWebhookRoutes);
  await app.register(campaignsRoutes);
  await app.register(automationsRoutes);
  await app.register(privacyRoutes);
  await app.register(webhooksRoutes);
  await app.register(apiTokensRoutes);
  await app.register(publicApiV1Routes);
  await app.register(analyticsRoutes);
  await app.register(platformUsageRoutes);
  await app.register(aiQuotaRoutes);
  await app.register(teamChatRoutes);
  await app.register(demoRoutes);

  app.get("/health", async () => ({ ok: true }));

  // Qual IA a plataforma oferece sem chave do tenant (ADR-005). O painel usa
  // isso para nao pedir chave BYOK quando o .env ja resolve.
  app.get("/platform/ai", { preHandler: requireSession }, async () => platformAiSummary());

  return app;
}
