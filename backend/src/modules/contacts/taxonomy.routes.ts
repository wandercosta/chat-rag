import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { contactFilterSchema } from "./contact-filter.js";
import { DuplicateNameError, ReservedFieldKeyError, taxonomyService } from "./taxonomy.service.js";

const readRoles = ["Administrador", "Atendente", "Analista"] as const;
const adminOnly = ["Administrador"] as const;

const tagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
const fieldSchema = z.object({
  label: z.string().trim().min(1).max(60),
  type: z.enum(["texto", "numero", "data"]).default("texto"),
});
const segmentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  filter: contactFilterSchema,
});

type OrgParams = { Params: { organizationId: string } };
type ItemParams = { Params: { organizationId: string; id: string } };

function conflict(err: unknown, reply: FastifyReply, what: string) {
  if (err instanceof DuplicateNameError)
    return reply.code(409).send({ error: `ja existe ${what} com esse nome` });
  if (err instanceof ReservedFieldKeyError)
    return reply.code(422).send({ error: "esse nome ja e uma coluna padrao do contato" });
  throw err;
}

/** Etiquetas, campos personalizados e segmentos de contatos. */
export async function contactTaxonomyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  const resources = [
    {
      path: "contact-tags",
      what: "uma etiqueta",
      list: taxonomyService.listTags,
      create: (actor: string, org: string, body: unknown) => {
        const input = tagSchema.parse(body);
        return taxonomyService.createTag(actor, org, input.name, input.color);
      },
      remove: taxonomyService.removeTag,
    },
    {
      path: "contact-fields",
      what: "um campo",
      list: taxonomyService.listFields,
      create: (actor: string, org: string, body: unknown) => {
        const input = fieldSchema.parse(body);
        return taxonomyService.createField(actor, org, input.label, input.type);
      },
      remove: taxonomyService.removeField,
    },
    {
      path: "contact-segments",
      what: "um segmento",
      list: taxonomyService.listSegments,
      create: (actor: string, org: string, body: unknown) => {
        const input = segmentSchema.parse(body);
        return taxonomyService.createSegment(actor, org, input.name, input.filter);
      },
      remove: taxonomyService.removeSegment,
    },
  ];

  for (const resource of resources) {
    const path = `/organizations/:organizationId/${resource.path}`;

    app.get<OrgParams>(path, { preHandler: requireOrgRole(readRoles) }, async (request) =>
      resource.list(request.params.organizationId),
    );

    app.post<OrgParams>(path, { preHandler: requireOrgRole(adminOnly) }, async (request, reply) => {
      try {
        const created = await resource.create(
          request.auth!.userId,
          request.params.organizationId,
          request.body,
        );
        return reply.code(201).send(created);
      } catch (err) {
        return conflict(err, reply, resource.what);
      }
    });

    app.delete<ItemParams>(
      `${path}/:id`,
      { preHandler: requireOrgRole(adminOnly) },
      async (request, reply) => {
        const removed = await resource.remove(
          request.auth!.userId,
          request.params.organizationId,
          request.params.id,
        );
        if (!removed) return reply.code(404).send({ error: "nao encontrado" });
        return reply.code(204).send();
      },
    );
  }
}
