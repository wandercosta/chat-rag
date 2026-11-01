import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { attachmentsService } from "./attachments.service.js";
import { headerFileName } from "./file-headers.js";

const querySchema = z.object({ exp: z.coerce.number().int(), sig: z.string().max(100) });
/** Imagem enviada pode abrir no navegador (pre-visualizacao no widget); o resto baixa. */
const INLINE = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Link publico e temporario de arquivo enviado por atendente (widget e
 * Instagram). Sem sessao; vale a assinatura e o prazo do link. Arquivo
 * recebido do cliente nunca sai por aqui.
 */
export async function mediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { attachmentId: string } }>("/media/:attachmentId", async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    const id = z.string().uuid().safeParse(request.params.attachmentId);
    if (!query.success || !id.success) return reply.code(404).send({ error: "nao encontrado" });

    const file = await attachmentsService.openByLink(id.data, query.data.exp, query.data.sig);
    if (!file) return reply.code(404).send({ error: "link invalido ou expirado" });
    const disposition = INLINE.has(file.mimeType) ? "inline" : "attachment";
    return reply
      .header("Content-Type", file.mimeType)
      .header("Content-Disposition", `${disposition}; filename="${headerFileName(file.fileName)}"`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox")
      .header("Cache-Control", "private, max-age=300")
      .send(file.data);
  });
}
