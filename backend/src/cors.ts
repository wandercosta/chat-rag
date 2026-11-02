import type { FastifyInstance } from "fastify";
import { env } from "./config/env.js";

/**
 * CORS implementado a mao em vez de @fastify/cors: a distincao entre painel
 * (origem restrita + cookie) e widget publico (qualquer origem, sem cookie)
 * precisa do path da requisicao, e a callback `origin` de @fastify/cors so
 * recebe o header Origin — sem acesso a request nem a `this` = request (e o
 * fastify instance), entao nao da pra decidir por path daquele jeito.
 *
 *   - /widget/*: qualquer origem (o script roda em qualquer site que o
 *     instalar). Autenticacao e por `key` no corpo + dominio validado no
 *     servidor (embed/public-access.service.ts), nunca por cookie.
 *   - todo o resto (painel/admin): so as origens em CORS_ORIGIN, com
 *     credentials (cookie de sessao httpOnly).
 */
const allowedPanelOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());

export function registerCors(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const isWidget = request.url.startsWith("/widget/");

    if (origin && (isWidget || allowedPanelOrigins.includes(origin))) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
      if (!isWidget) {
        reply.header("Access-Control-Allow-Credentials", "true");
        // Exportacoes (CSV de contatos, JSON da LGPD) mandam o nome do arquivo aqui.
        reply.header("Access-Control-Expose-Headers", "Content-Disposition");
      }
    }

    if (request.method === "OPTIONS") {
      reply
        .header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type")
        .code(204)
        .send();
    }
  });
}
