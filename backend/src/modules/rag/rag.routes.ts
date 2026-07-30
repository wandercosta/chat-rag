import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { AssistantNotFoundError, answerService } from "./answer.service.js";
import { NoActiveCredentialError } from "./provider-resolver.js";

const messageSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().uuid().optional(),
  environment: z.enum(["teste", "producao"]).optional(),
});

export async function ragRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.post<{ Params: { organizationId: string; assistantId: string } }>(
    "/organizations/:organizationId/assistants/:assistantId/playground-messages",
    { preHandler: requireOrgRole(["Administrador", "Editor de base"]) },
    async (request, reply) => {
      const body = messageSchema.parse(request.body);
      try {
        return await answerService.answer(request.params.organizationId, request.params.assistantId, body.message, {
          conversationId: body.conversationId,
          environment: body.environment,
        });
      } catch (err) {
        if (err instanceof AssistantNotFoundError) {
          return reply.code(404).send({ error: "assistente nao encontrado" });
        }
        if (err instanceof NoActiveCredentialError) {
          return reply.code(409).send({ error: "sem chave de IA valida configurada para esta organizacao" });
        }
        throw err;
      }
    },
  );
}
