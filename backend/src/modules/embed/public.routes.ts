import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { conversationsService } from "../conversations/index.js";
import { AssistantNotFoundError, NoActiveCredentialError, answerService } from "../rag/index.js";
import { NoHandoffConfiguredError, SectorNotFoundError, handoffService } from "../assistants/index.js";
import { usageService } from "../analytics/index.js";
import { DomainNotAllowedError, InvalidKeyError, publicAccessService } from "./public-access.service.js";
import { rateLimits } from "./rate-limit.js";

const keySchema = z.object({ key: z.string().min(1) });
const messageSchema = keySchema.extend({ message: z.string().min(1) });
const feedbackSchema = keySchema.extend({ rating: z.enum(["positivo", "negativo"]) });
const handoffSchema = keySchema.extend({ sectorId: z.string().uuid().optional() });

function originOf(request: import("fastify").FastifyRequest): string | undefined {
  return (request.headers.origin as string | undefined) ?? (request.headers.referer as string | undefined);
}

export async function embedPublicRoutes(app: FastifyInstance) {
  app.post("/widget/config", async (request, reply) => {
    const body = keySchema.parse(request.body);
    try {
      const resolved = await publicAccessService.resolveAndAuthorize(body.key, originOf(request));
      if (!(await rateLimits.perKeyAndIp(resolved.id, request.ip))) {
        await usageService.record({ organizationId: resolved.organizationId, assistantId: resolved.assistantId, type: "widget_rate_limited" });
        return reply.code(429).send({ error: "limite de requisicoes excedido" });
      }
      await usageService.record({ organizationId: resolved.organizationId, assistantId: resolved.assistantId, type: "widget_loaded" });
      return { assistantId: resolved.assistantId, environment: resolved.environment };
    } catch (err) {
      return handlePublicError(err, reply);
    }
  });

  app.post("/widget/conversations", async (request, reply) => {
    const body = keySchema.parse(request.body);
    try {
      const resolved = await publicAccessService.resolveAndAuthorize(body.key, originOf(request));
      const host = new URL(originOf(request) ?? "").hostname;

      if (!(await rateLimits.perKeyAndIp(resolved.id, request.ip))) {
        return reply.code(429).send({ error: "limite de requisicoes excedido" });
      }
      if (!(await rateLimits.newConversation(resolved.id, host))) {
        return reply.code(429).send({ error: "limite de novas conversas excedido" });
      }

      const conversation = await conversationsService.start(resolved.organizationId, resolved.assistantId, "widget");
      return reply.code(201).send({ conversationId: conversation.id });
    } catch (err) {
      return handlePublicError(err, reply);
    }
  });

  app.post<{ Params: { conversationId: string } }>(
    "/widget/conversations/:conversationId/messages",
    async (request, reply) => {
      const body = messageSchema.parse(request.body);
      try {
        const resolved = await publicAccessService.resolveAndAuthorize(body.key, originOf(request));

        if (!(await rateLimits.perKeyAndIp(resolved.id, request.ip))) {
          return reply.code(429).send({ error: "limite de requisicoes excedido" });
        }
        if (!(await rateLimits.messagePerConversation(request.params.conversationId))) {
          return reply.code(429).send({ error: "limite de mensagens da conversa excedido" });
        }

        const conversation = await conversationsService.getWithMessages(
          resolved.organizationId,
          request.params.conversationId,
        );
        if (!conversation || conversation.assistant_id !== resolved.assistantId) {
          return reply.code(404).send({ error: "conversa nao encontrada" });
        }

        const result = await answerService.answer(resolved.organizationId, resolved.assistantId, body.message, {
          conversationId: request.params.conversationId,
          environment: resolved.environment,
        });
        return { answer: result.answer };
      } catch (err) {
        return handlePublicError(err, reply);
      }
    },
  );

  app.post<{ Params: { conversationId: string } }>(
    "/widget/conversations/:conversationId/feedback",
    async (request, reply) => {
      const body = feedbackSchema.parse(request.body);
      try {
        const resolved = await publicAccessService.resolveAndAuthorize(body.key, originOf(request));
        const conversation = await conversationsService.getWithMessages(
          resolved.organizationId,
          request.params.conversationId,
        );
        if (!conversation || conversation.assistant_id !== resolved.assistantId) {
          return reply.code(404).send({ error: "conversa nao encontrada" });
        }

        await conversationsService.recordFeedback(request.params.conversationId, body.rating);
        return { ok: true };
      } catch (err) {
        return handlePublicError(err, reply);
      }
    },
  );

  // So a ultima pergunta e enviada ao abrir o WhatsApp, nunca o historico
  // completo (docs/integrations/widget-embed.md - Encaminhamento).
  app.post<{ Params: { conversationId: string } }>(
    "/widget/conversations/:conversationId/handoff",
    async (request, reply) => {
      const body = handoffSchema.parse(request.body);
      try {
        const resolved = await publicAccessService.resolveAndAuthorize(body.key, originOf(request));

        if (!(await rateLimits.perKeyAndIp(resolved.id, request.ip))) {
          return reply.code(429).send({ error: "limite de requisicoes excedido" });
        }

        const conversation = await conversationsService.getWithMessages(
          resolved.organizationId,
          request.params.conversationId,
        );
        if (!conversation || conversation.assistant_id !== resolved.assistantId) {
          return reply.code(404).send({ error: "conversa nao encontrada" });
        }

        const lastQuestion = [...conversation.messages].reverse().find((m) => m.role === "visitante")?.content ?? "";
        const resolution = await handoffService.resolveForWidget(resolved.assistantId, lastQuestion, body.sectorId);
        return resolution;
      } catch (err) {
        if (err instanceof NoHandoffConfiguredError) {
          return reply.code(409).send({ error: "encaminhamento nao configurado para este assistente" });
        }
        if (err instanceof SectorNotFoundError) {
          return reply.code(422).send({ error: "setor invalido" });
        }
        return handlePublicError(err, reply);
      }
    },
  );
}

function handlePublicError(err: unknown, reply: import("fastify").FastifyReply) {
  if (err instanceof InvalidKeyError) return reply.code(401).send({ error: "chave invalida" });
  if (err instanceof DomainNotAllowedError) return reply.code(403).send({ error: "dominio nao autorizado" });
  if (err instanceof AssistantNotFoundError) return reply.code(404).send({ error: "assistente nao encontrado" });
  if (err instanceof NoActiveCredentialError) {
    return reply.code(409).send({ error: "assistente indisponivel no momento" });
  }
  throw err;
}
