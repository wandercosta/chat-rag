import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { conversationsService, visitorsService } from "../conversations/index.js";
import { answerService } from "../rag/index.js";
import { inboxService } from "../inbox/index.js";
import {
  NoHandoffConfiguredError,
  SectorNotFoundError,
  assistantsService,
  handoffService,
} from "../assistants/index.js";
import { usageService } from "../analytics/index.js";
import { publicAccessService } from "./public-access.service.js";
import { handlePublicError, originOf } from "./public-helpers.js";
import { rateLimits } from "./rate-limit.js";
import { WIDGET_SCRIPT_CONTENT } from "./widget-code.js";

const keySchema = z.object({ key: z.string().min(1) });
const startConversationSchema = keySchema.extend({
  externalUserId: z.string().min(1).max(200).optional(),
  visitorName: z.string().min(1).max(200).optional(),
  visitorEmail: z.string().email().optional(),
  context: z.record(z.unknown()).optional(),
});
const messageSchema = keySchema.extend({ message: z.string().min(1).max(4000) });
const feedbackSchema = keySchema.extend({ rating: z.enum(["positivo", "negativo"]) });
const handoffSchema = keySchema.extend({ sectorId: z.string().uuid().optional() });

export async function embedPublicRoutes(app: FastifyInstance) {
  app.get("/chat-widget.js", async (_request, reply) => {
    return reply
      .header("Content-Type", "application/javascript; charset=utf-8")
      .header("Access-Control-Allow-Origin", "*")
      .header("Cache-Control", "public, max-age=3600")
      .send(WIDGET_SCRIPT_CONTENT);
  });

  app.post("/widget/config", async (request, reply) => {
    const body = keySchema.parse(request.body);
    try {
      const resolved = await publicAccessService.resolveAndAuthorize(body.key, originOf(request));
      if (!(await rateLimits.perKeyAndIp(resolved.id, request.ip))) {
        await usageService.record({
          organizationId: resolved.organizationId,
          assistantId: resolved.assistantId,
          type: "widget_rate_limited",
        });
        return reply.code(429).send({ error: "limite de requisicoes excedido" });
      }
      await usageService.record({
        organizationId: resolved.organizationId,
        assistantId: resolved.assistantId,
        type: "widget_loaded",
      });
      const assistant = await assistantsService.get(resolved.organizationId, resolved.assistantId);
      return {
        assistantId: resolved.assistantId,
        environment: resolved.environment,
        // Aparencia definida no painel; atributos data-* do <script> sobrescrevem.
        appearance: assistant?.widget_settings ?? {},
        // Pedido de atendente vai para a caixa de entrada do painel (ADR-006)
        // em vez do link do WhatsApp.
        humanInbox: assistant?.human_inbox_enabled ?? false,
      };
    } catch (err) {
      return handlePublicError(err, reply);
    }
  });

  app.post("/widget/conversations", async (request, reply) => {
    const body = startConversationSchema.parse(request.body);
    try {
      const resolved = await publicAccessService.resolveAndAuthorize(body.key, originOf(request));
      const host = new URL(originOf(request) ?? "").hostname;

      if (!(await rateLimits.perKeyAndIp(resolved.id, request.ip))) {
        return reply.code(429).send({ error: "limite de requisicoes excedido" });
      }
      if (!(await rateLimits.newConversation(resolved.id, host))) {
        return reply.code(429).send({ error: "limite de novas conversas excedido" });
      }

      const visitor = await visitorsService.resolve(resolved.organizationId, {
        externalUserId: body.externalUserId,
        name: body.visitorName,
        email: body.visitorEmail,
        context: body.context,
      });

      const { conversation, isResumed, messages } = await conversationsService.startOrResume(
        resolved.organizationId,
        resolved.assistantId,
        "widget",
        visitor?.id ?? null,
      );
      return reply.code(isResumed ? 200 : 201).send({
        conversationId: conversation.id,
        isResumed,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          citations: m.citations,
        })),
      });
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

        // Com um humano na conversa o assistente fica calado (ADR-006 #5): a
        // mensagem e gravada e chega ao painel pelo tempo real.
        if (await inboxService.isWithHuman(resolved.organizationId, conversation.id)) {
          await conversationsService.addVisitorMessage(conversation.id, body.message);
          await inboxService.onVisitorMessage(resolved.organizationId, conversation.id);
          return { answer: null, citations: [], humanHandling: true };
        }

        const result = await answerService.answer(
          resolved.organizationId,
          resolved.assistantId,
          body.message,
          {
            conversationId: request.params.conversationId,
            environment: resolved.environment,
          },
        );
        await inboxService.touched(resolved.organizationId, conversation.id);
        return { answer: result.answer, citations: result.citations, humanHandling: false };
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

        const assistant = await assistantsService.get(
          resolved.organizationId,
          resolved.assistantId,
        );
        if (assistant?.human_inbox_enabled) {
          const assignment = await inboxService.requestHuman(
            resolved.organizationId,
            conversation.id,
          );
          return { inbox: true, status: assignment.status };
        }

        const lastQuestion =
          [...conversation.messages].reverse().find((m) => m.role === "visitante")?.content ?? "";
        const resolution = await handoffService.resolveForWidget(
          resolved.assistantId,
          lastQuestion,
          body.sectorId,
        );
        return resolution;
      } catch (err) {
        if (err instanceof NoHandoffConfiguredError) {
          return reply
            .code(409)
            .send({ error: "encaminhamento nao configurado para este assistente" });
        }
        if (err instanceof SectorNotFoundError) {
          return reply.code(422).send({ error: "setor invalido" });
        }
        return handlePublicError(err, reply);
      }
    },
  );
}
