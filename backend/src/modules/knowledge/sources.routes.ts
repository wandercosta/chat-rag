import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { putSourceFile, sourceObjectKey } from "../../storage/objects.js";
import {
  InvalidTransitionError,
  MAX_FILE_BYTES,
  TopicNotFoundError,
  sourcesService,
} from "./sources.service.js";

const roles = ["Administrador", "Editor de base"] as const;

const createTextSchema = z.object({
  topicId: z.string().uuid(),
  title: z.string().min(2),
  kind: z.enum(["texto", "URL"]),
  content: z.string().min(1),
});

const FILE_MIME_TO_KIND: Record<string, "PDF" | "DOCX"> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

function handleServiceError(err: unknown, reply: import("fastify").FastifyReply) {
  if (err instanceof TopicNotFoundError)
    return reply.code(404).send({ error: "topico nao encontrado" });
  if (err instanceof InvalidTransitionError)
    return reply.code(409).send({ error: "transicao de estado invalida" });
  if (err instanceof RangeError) return reply.code(422).send({ error: err.message });
  throw err;
}

export async function sourcesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string; topicId: string } }>(
    "/organizations/:organizationId/topics/:topicId/sources",
    { preHandler: requireOrgRole([...roles, "Analista"]) },
    async (request) => {
      return sourcesService.list(request.params.organizationId, request.params.topicId);
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/sources",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = createTextSchema.parse(request.body);
      try {
        const source = await sourcesService.createTextOrUrl(
          request.auth!.userId,
          request.params.organizationId,
          body,
        );
        return reply.code(201).send(source);
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/sources/upload",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const file = await request.file({ limits: { fileSize: MAX_FILE_BYTES } });
      if (!file) return reply.code(400).send({ error: "arquivo ausente" });

      const kind = FILE_MIME_TO_KIND[file.mimetype];
      if (!kind)
        return reply.code(422).send({ error: "tipo de arquivo nao suportado (use PDF ou DOCX)" });

      const topicId = (file.fields.topicId as { value?: string } | undefined)?.value;
      const title = (file.fields.title as { value?: string } | undefined)?.value ?? file.filename;
      if (!topicId) return reply.code(422).send({ error: "topicId e obrigatorio" });

      const buffer = await file.toBuffer();
      if (buffer.byteLength > MAX_FILE_BYTES) {
        return reply.code(413).send({ error: "arquivo excede o limite permitido" });
      }

      const sourceId = randomUUID();
      const storageKey = sourceObjectKey(request.params.organizationId, sourceId, file.filename);
      await putSourceFile(storageKey, buffer, file.mimetype);

      try {
        const source = await sourcesService.createFileSource(
          request.auth!.userId,
          request.params.organizationId,
          {
            topicId,
            title,
            kind,
            storageKey,
          },
        );
        return reply.code(201).send(source);
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  // Precisa vir antes de /sources/:sourceId/* para o roteador nao tratar
  // "activate-pending" como um sourceId.
  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/sources/activate-pending",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      return sourcesService.activatePending(request.params.organizationId);
    },
  );

  app.post<{ Params: { organizationId: string; sourceId: string } }>(
    "/organizations/:organizationId/sources/:sourceId/approve",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      try {
        return await sourcesService.approve(
          request.auth!.userId,
          request.params.organizationId,
          request.params.sourceId,
        );
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  app.post<{ Params: { organizationId: string; sourceId: string } }>(
    "/organizations/:organizationId/sources/:sourceId/review",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const { reviewed } = z.object({ reviewed: z.boolean() }).parse(request.body);
      try {
        return await sourcesService.setReviewed(
          request.auth!.userId,
          request.params.organizationId,
          request.params.sourceId,
          reviewed,
        );
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  app.post<{ Params: { organizationId: string; sourceId: string } }>(
    "/organizations/:organizationId/sources/:sourceId/reindex",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      try {
        return await sourcesService.reindex(
          request.auth!.userId,
          request.params.organizationId,
          request.params.sourceId,
        );
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  app.post<{ Params: { organizationId: string; sourceId: string } }>(
    "/organizations/:organizationId/sources/:sourceId/archive",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      try {
        return await sourcesService.archive(
          request.auth!.userId,
          request.params.organizationId,
          request.params.sourceId,
        );
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );
}
