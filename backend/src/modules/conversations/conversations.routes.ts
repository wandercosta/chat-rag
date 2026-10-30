import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { attachmentsService } from "./attachments.service.js";
import { conversationsService } from "./conversations.service.js";

const readRoles = ["Administrador", "Analista"] as const;
/** Arquivo recebido: quem le a conversa no historico ou na caixa de entrada. */
const attachmentRoles = ["Administrador", "Atendente", "Analista"] as const;

/** Nome seguro no cabecalho: sem aspas, barras nem caracteres de controle. */
function headerFileName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "arquivo";
}

const querySchema = z.object({
  assistantId: z.string().uuid().optional(),
  visitorId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const feedbackSchema = z.object({ rating: z.enum(["positivo", "negativo"]) });

export async function conversationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/conversations",
    { preHandler: requireOrgRole(readRoles) },
    async (request) => {
      const filters = querySchema.parse(request.query);
      return conversationsService.list(request.params.organizationId, filters);
    },
  );

  app.get<{ Params: { organizationId: string; conversationId: string } }>(
    "/organizations/:organizationId/conversations/:conversationId",
    { preHandler: requireOrgRole(readRoles) },
    async (request, reply) => {
      const conversation = await conversationsService.getWithMessages(
        request.params.organizationId,
        request.params.conversationId,
      );
      if (!conversation) return reply.code(404).send({ error: "conversa nao encontrada" });
      return conversation;
    },
  );

  // Sempre como download (nunca renderizado pela origem da API): o arquivo vem
  // de fora e pode ser um HTML/SVG com script. O painel monta a pre-visualizacao.
  app.get<{ Params: { organizationId: string; conversationId: string; attachmentId: string } }>(
    "/organizations/:organizationId/conversations/:conversationId/attachments/:attachmentId",
    { preHandler: requireOrgRole(attachmentRoles) },
    async (request, reply) => {
      const { organizationId, conversationId, attachmentId } = request.params;
      const ids = z.array(z.string().uuid()).safeParse([conversationId, attachmentId]);
      if (!ids.success) {
        return reply.code(404).send({ error: "arquivo nao encontrado" });
      }
      const file = await attachmentsService.open(organizationId, conversationId, attachmentId);
      if (!file) return reply.code(404).send({ error: "arquivo nao encontrado" });
      return reply
        .header("Content-Type", file.mimeType)
        .header("Content-Disposition", `attachment; filename="${headerFileName(file.fileName)}"`)
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "private, no-store")
        .send(file.data);
    },
  );

  app.post<{ Params: { organizationId: string; conversationId: string } }>(
    "/organizations/:organizationId/conversations/:conversationId/feedback",
    { preHandler: requireOrgRole(readRoles) },
    async (request) => {
      const body = feedbackSchema.parse(request.body);
      await conversationsService.recordFeedback(request.params.conversationId, body.rating);
      return { ok: true };
    },
  );
}
