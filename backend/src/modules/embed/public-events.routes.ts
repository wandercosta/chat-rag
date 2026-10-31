import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { conversationsService } from "../conversations/index.js";
import { realtime } from "../../realtime/events.js";
import { startSse } from "../../realtime/sse.js";
import { publicAccessService } from "./public-access.service.js";
import { handlePublicError, originOf } from "./public-helpers.js";
import { rateLimits } from "./rate-limit.js";

const querySchema = z.object({ key: z.string().min(1) });

/**
 * Resposta do atendente chegando ao widget em tempo real (ADR-006 #10).
 * Mesma autenticacao das outras rotas publicas da conversa: chave + origem
 * permitida + conversa do proprio assistente. `EventSource` nao manda corpo,
 * entao a chave publica vai na query — ela ja e publica no `<script>`.
 *
 * So passam a resposta do atendente e o status desta conversa; nota interna
 * nunca chega aqui (nem existe evento com o conteudo dela).
 */
export async function embedPublicEventsRoutes(app: FastifyInstance) {
  app.get<{ Params: { conversationId: string } }>(
    "/widget/conversations/:conversationId/events",
    async (request, reply) => {
      const { key } = querySchema.parse(request.query);
      try {
        const resolved = await publicAccessService.resolveAndAuthorize(key, originOf(request));
        if (!(await rateLimits.perKeyAndIp(resolved.id, request.ip))) {
          return reply.code(429).send({ error: "limite de requisicoes excedido" });
        }

        const conversation = await conversationsService.get(
          resolved.organizationId,
          request.params.conversationId,
        );
        if (!conversation || conversation.assistant_id !== resolved.assistantId) {
          return reply.code(404).send({ error: "conversa nao encontrada" });
        }

        const stream = startSse(request, reply);
        const unsubscribe = await realtime.subscribe(resolved.organizationId, (event) => {
          if (!("conversationId" in event) || event.conversationId !== conversation.id) return;
          if (event.kind === "agent_message" || event.kind === "status") stream.send(event);
        });
        stream.onClose(unsubscribe);
      } catch (err) {
        return handlePublicError(err, reply);
      }
    },
  );
}
