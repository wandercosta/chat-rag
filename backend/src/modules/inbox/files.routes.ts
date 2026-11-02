import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { actorOf, handleInboxError, type ConversationParams } from "./inbox.routes.js";
import { UnsupportedFileError, sendFile } from "./send-file.js";

/** Envio de arquivo pelo atendente (multipart: `file` e `caption` opcional). */
export async function inboxFilesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.post<ConversationParams>(
    "/organizations/:organizationId/inbox/:conversationId/files",
    { preHandler: requireOrgRole(["Administrador", "Atendente"]) },
    async (request, reply) => {
      const actor = actorOf(request);
      if (!actor) return reply.code(403).send({ error: "acesso de suporte nao atende conversas" });

      const file = await request.file({ limits: { fileSize: env.OUTBOUND_MEDIA_MAX_BYTES } });
      if (!file) return reply.code(400).send({ error: "arquivo ausente" });
      const data = await file.toBuffer().catch(() => null);
      if (!data || file.file.truncated) {
        return reply.code(413).send({ error: "arquivo maior que o limite da plataforma" });
      }
      const caption = (file.fields.caption as { value?: string } | undefined)?.value?.trim();
      if (caption && caption.length > 1000) {
        return reply.code(422).send({ error: "legenda com mais de 1000 caracteres" });
      }

      try {
        const message = await sendFile(
          actor,
          request.params.organizationId,
          request.params.conversationId,
          { data, mimeType: file.mimetype, fileName: file.filename, caption: caption || null },
        );
        return reply.code(201).send(message);
      } catch (err) {
        if (err instanceof UnsupportedFileError) {
          return reply.code(422).send({ error: err.message });
        }
        return handleInboxError(err, reply);
      }
    },
  );
}
