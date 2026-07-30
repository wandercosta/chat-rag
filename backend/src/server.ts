import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { identityPlugin } from "./modules/identity/index.js";
import { organizationsRoutes, aiCredentialsRoutes } from "./modules/organizations/index.js";
import { auditRoutes } from "./modules/audit/index.js";
import { assistantsRoutes, modelCatalogRoutes } from "./modules/assistants/index.js";
import { collectionsRoutes, topicsRoutes, sourcesRoutes } from "./modules/knowledge/index.js";
import { conversationsRoutes, gapsRoutes } from "./modules/conversations/index.js";
import { ragRoutes } from "./modules/rag/index.js";
import { embedAdminRoutes, embedPublicRoutes } from "./modules/embed/index.js";
import { analyticsRoutes } from "./modules/analytics/index.js";

const app = Fastify({ logger: true });

await app.register(cookie);
await app.register(multipart);
await app.register(identityPlugin);
await app.register(organizationsRoutes);
await app.register(aiCredentialsRoutes);
await app.register(auditRoutes);
await app.register(assistantsRoutes);
await app.register(modelCatalogRoutes);
await app.register(collectionsRoutes);
await app.register(topicsRoutes);
await app.register(sourcesRoutes);
await app.register(conversationsRoutes);
await app.register(gapsRoutes);
await app.register(ragRoutes);
await app.register(embedAdminRoutes);
await app.register(embedPublicRoutes);
await app.register(analyticsRoutes);

app.get("/health", async () => ({ ok: true }));

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`chatrag-backend em http://localhost:${env.PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
