import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditService } from "../audit/index.js";
import {
  DuplicateContactError,
  InvalidContactFieldError,
  contactsService,
} from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { requireApiScope } from "./api-auth.js";

/**
 * API REST publica v1 (etapa 8). Respostas com formato proprio e estavel,
 * montado aqui: uma coluna nova no banco nao vaza para fora sem querer.
 */

type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  custom_fields: Record<string, string>;
  opt_in_at: Date | null;
  opted_out_at: Date | null;
  created_at: Date;
  updated_at: Date;
  tags?: { id: string; name: string }[];
};

const contactOut = (c: ContactRow) => ({
  id: c.id,
  name: c.name,
  email: c.email,
  phone: c.phone,
  customFields: c.custom_fields,
  optIn: !!c.opt_in_at && !c.opted_out_at,
  tags: (c.tags ?? []).map(({ id, name }) => ({ id, name })),
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});

const conversationOut = (c: {
  id: string;
  channel: string;
  assistant_id: string;
  contact_id: string | null;
  started_at: Date;
}) => ({
  id: c.id,
  channel: c.channel,
  assistantId: c.assistant_id,
  contactId: c.contact_id,
  startedAt: c.started_at,
});

const listContactsQuery = z.object({
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
const createContactSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  email: z.string().max(320).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  optIn: z.boolean().optional(),
  customFields: z.record(z.string().max(80), z.string().max(500)).optional(),
});
const listConversationsQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

type IdParams = { Params: { id: string } };
const uuid = z.string().uuid();

export async function publicApiV1Routes(app: FastifyInstance) {
  app.decorateRequest("apiToken", null);

  app.get("/api/v1/contacts", { preHandler: requireApiScope("contacts:read") }, async (request) => {
    const query = listContactsQuery.parse(request.query);
    const result = await contactsService.list(
      request.apiToken!.organizationId,
      { search: query.search },
      query.page,
    );
    return { ...result, items: result.items.map(contactOut) };
  });

  app.get<IdParams>(
    "/api/v1/contacts/:id",
    { preHandler: requireApiScope("contacts:read") },
    async (request, reply) => {
      const id = uuid.safeParse(request.params.id);
      const contact = id.success
        ? await contactsService.get(request.apiToken!.organizationId, id.data)
        : null;
      if (!contact) return reply.code(404).send({ error: "contato nao encontrado" });
      return contactOut(contact);
    },
  );

  app.post(
    "/api/v1/contacts",
    { preHandler: requireApiScope("contacts:write") },
    async (request, reply) => {
      const body = createContactSchema.parse(request.body);
      const token = request.apiToken!;
      // ADR-006 #3: toda acao tem um responsavel humano; sem quem criou o
      // token (pessoa removida), ele so le.
      if (!token.createdBy) {
        return reply.code(403).send({ error: "o token perdeu o responsavel; crie um novo" });
      }
      try {
        const contact = await contactsService.create(token.createdBy, token.organizationId, body);
        await auditService.record({
          actorUserId: token.createdBy,
          organizationId: token.organizationId,
          action: `Token de API "${token.name}" criou contato`,
          type: "conteudo",
          target: contact.id,
        });
        return reply.code(201).send(contactOut(contact));
      } catch (err) {
        if (err instanceof DuplicateContactError) {
          return reply.code(409).send({ error: `ja existe um contato com esse ${err.field}` });
        }
        if (err instanceof InvalidContactFieldError) {
          return reply.code(422).send({ error: `${err.field} invalido` });
        }
        throw err;
      }
    },
  );

  app.get(
    "/api/v1/conversations",
    { preHandler: requireApiScope("conversations:read") },
    async (request) => {
      const query = listConversationsQuery.parse(request.query);
      const rows = await conversationsService.list(request.apiToken!.organizationId, query);
      return { items: rows.map(conversationOut) };
    },
  );

  app.get<IdParams>(
    "/api/v1/conversations/:id",
    { preHandler: requireApiScope("conversations:read") },
    async (request, reply) => {
      const id = uuid.safeParse(request.params.id);
      const conversation = id.success
        ? await conversationsService.getWithMessages(request.apiToken!.organizationId, id.data)
        : null;
      if (!conversation) return reply.code(404).send({ error: "conversa nao encontrada" });
      return {
        ...conversationOut(conversation),
        messages: conversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
        })),
      };
    },
  );
}
