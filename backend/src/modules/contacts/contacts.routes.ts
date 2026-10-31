import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import type { ContactFilter } from "../../db/types.js";
import { contactQuerySchema, mergeFilters } from "./contact-filter.js";
import {
  ContactNotFoundError,
  ConversationAlreadyLinkedError,
  ConversationNotFoundError,
  DuplicateContactError,
  InvalidContactFieldError,
  contactsService,
} from "./contacts.service.js";
import {
  ImportTooLargeError,
  ImportWithoutContactColumnError,
  MAX_IMPORT_ROWS,
  exportContacts,
  importContacts,
} from "./io.service.js";
import { taxonomyService } from "./taxonomy.service.js";

const readRoles = ["Administrador", "Atendente", "Analista"] as const;
const writeRoles = ["Administrador", "Atendente"] as const;

const contactSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  email: z.string().max(320).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  optIn: z.boolean().optional(),
  customFields: z.record(z.string().max(80), z.string().max(500)).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
});
const fromConversationSchema = contactSchema.extend({ conversationId: z.string().uuid() });

type OrgParams = { Params: { organizationId: string } };
type ContactParams = { Params: { organizationId: string; contactId: string } };

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof ContactNotFoundError)
    return reply.code(404).send({ error: "contato nao encontrado" });
  if (err instanceof ConversationNotFoundError)
    return reply.code(404).send({ error: "conversa nao encontrada" });
  if (err instanceof ConversationAlreadyLinkedError)
    return reply.code(409).send({ error: "esta conversa ja tem um contato" });
  if (err instanceof DuplicateContactError) {
    const what = err.field === "email" ? "e-mail" : "telefone";
    return reply.code(409).send({ error: `ja existe um contato com esse ${what}` });
  }
  if (err instanceof InvalidContactFieldError) {
    const what = err.field === "email" ? "e-mail" : "telefone";
    return reply.code(422).send({ error: `${what} invalido` });
  }
  if (err instanceof ImportTooLargeError)
    return reply.code(413).send({ error: `limite de ${MAX_IMPORT_ROWS} linhas por arquivo` });
  if (err instanceof ImportWithoutContactColumnError)
    return reply.code(422).send({ error: "o arquivo precisa de uma coluna de e-mail ou telefone" });
  throw err;
}

/** Filtro da tela, por cima do segmento escolhido (se houver). */
async function filterFrom(request: FastifyRequest<OrgParams>, reply: FastifyReply) {
  const query = contactQuerySchema.parse(request.query);
  const own: ContactFilter = {
    search: query.search,
    tagIds: query.tagIds,
    tagMatch: query.tagMatch,
    optIn: query.optIn,
  };
  if (!query.segmentId) return { filter: own, page: query.page };
  const segment = await taxonomyService.findSegment(request.params.organizationId, query.segmentId);
  if (!segment) {
    reply.code(404).send({ error: "segmento nao encontrado" });
    return null;
  }
  return { filter: mergeFilters(segment.filter, own), page: query.page };
}

export async function contactsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/contacts";

  app.get<OrgParams>(base, { preHandler: requireOrgRole(readRoles) }, async (request, reply) => {
    const parsed = await filterFrom(request, reply);
    if (!parsed) return;
    return contactsService.list(request.params.organizationId, parsed.filter, parsed.page);
  });

  app.get<OrgParams>(
    `${base}/export`,
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      const parsed = await filterFrom(request, reply);
      if (!parsed) return;
      const csv = await exportContacts(
        request.auth!.userId,
        request.params.organizationId,
        parsed.filter,
      );
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="contatos.csv"')
        .send(csv);
    },
  );

  app.post<OrgParams>(
    `${base}/import`,
    // CSV no corpo JSON (o painel le o arquivo); 5 mil linhas cabem em 4 MB.
    { preHandler: requireOrgRole(["Administrador"]), bodyLimit: 4 * 1024 * 1024 },
    async (request, reply) => {
      const { csv } = z.object({ csv: z.string().min(1) }).parse(request.body);
      try {
        return await importContacts(request.auth!.userId, request.params.organizationId, csv);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.post<OrgParams>(base, { preHandler: requireOrgRole(writeRoles) }, async (request, reply) => {
    const body = contactSchema.parse(request.body);
    try {
      const contact = await contactsService.create(
        request.auth!.userId,
        request.params.organizationId,
        body,
      );
      return reply.code(201).send(contact);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // "Salvar como contato" a partir de uma conversa da caixa de entrada.
  app.post<OrgParams>(
    `${base}/from-conversation`,
    { preHandler: requireOrgRole(writeRoles) },
    async (request, reply) => {
      const { conversationId, ...input } = fromConversationSchema.parse(request.body);
      try {
        const result = await contactsService.createFromConversation(
          request.auth!.userId,
          request.params.organizationId,
          conversationId,
          input,
        );
        return reply.code(result.merged ? 200 : 201).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.get<ContactParams>(
    `${base}/:contactId`,
    { preHandler: requireOrgRole(readRoles) },
    async (request, reply) => {
      const contact = await contactsService.get(
        request.params.organizationId,
        request.params.contactId,
      );
      if (!contact) return reply.code(404).send({ error: "contato nao encontrado" });
      return contact;
    },
  );

  app.patch<ContactParams>(
    `${base}/:contactId`,
    { preHandler: requireOrgRole(writeRoles) },
    async (request, reply) => {
      const body = contactSchema.parse(request.body);
      try {
        return await contactsService.update(
          request.auth!.userId,
          request.params.organizationId,
          request.params.contactId,
          body,
        );
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.delete<ContactParams>(
    `${base}/:contactId`,
    { preHandler: requireOrgRole(["Administrador"]) },
    async (request, reply) => {
      try {
        await contactsService.remove(
          request.auth!.userId,
          request.params.organizationId,
          request.params.contactId,
        );
        return reply.code(204).send();
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
