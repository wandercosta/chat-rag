import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import {
  LeadAlreadyReviewedError,
  LeadInsightNotFoundError,
  LeadModelError,
  LeadsUnavailableError,
} from "./errors.js";
import { leadsService } from "./leads.service.js";

type OrgParams = { Params: { organizationId: string } };
type ContactParams = { Params: { organizationId: string; contactId: string } };
type InsightParams = { Params: { organizationId: string; insightId: string } };

const uuid = z.string().uuid();
const currentQuery = z.object({
  contactIds: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(uuid).max(200)),
});

/** Escrita so de membro: o Master nao classifica nem revisa (ADR-009 #8). */
async function requireMember(
  request: FastifyRequest<{ Params: { organizationId?: string } }>,
  reply: FastifyReply,
) {
  const organizationId = request.params?.organizationId;
  if (!request.auth?.memberships.some((m) => m.organizationId === organizationId)) {
    return reply.code(403).send({ error: "so membros da organizacao classificam leads" });
  }
}

const canRead = { preHandler: requireOrgRole(["Administrador", "Atendente", "Analista"]) };
const canWrite = { preHandler: [requireOrgRole(["Administrador", "Atendente"]), requireMember] };
const canAdmin = { preHandler: [requireOrgRole(["Administrador"]), requireMember] };

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof LeadsUnavailableError) return reply.code(409).send({ error: err.message });
  if (err instanceof LeadInsightNotFoundError)
    return reply.code(404).send({ error: "nao encontrado" });
  if (err instanceof LeadAlreadyReviewedError) {
    return reply.code(409).send({ error: "essa sugestao ja foi revisada" });
  }
  if (err instanceof LeadModelError) {
    return reply.code(502).send({ error: "a IA respondeu num formato invalido; tente de novo" });
  }
  throw err;
}

export async function leadsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const org = "/organizations/:organizationId";

  app.get<OrgParams>(`${org}/lead-settings`, canRead, async (request) =>
    leadsService.settings(request.params.organizationId),
  );

  app.put<OrgParams>(`${org}/lead-settings`, canAdmin, async (request) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    return leadsService.setEnabled(request.auth!.userId, request.params.organizationId, enabled);
  });

  app.get<ContactParams>(
    `${org}/contacts/:contactId/lead-insights`,
    canRead,
    async (request, reply) => {
      if (!uuid.safeParse(request.params.contactId).success) return reply.code(404).send();
      return leadsService.forContact(request.params.organizationId, request.params.contactId);
    },
  );

  app.post<ContactParams>(
    `${org}/contacts/:contactId/lead-insights`,
    canWrite,
    async (request, reply) => {
      if (!uuid.safeParse(request.params.contactId).success) return reply.code(404).send();
      try {
        const insight = await leadsService.classify(
          request.auth!.userId,
          request.params.organizationId,
          request.params.contactId,
        );
        return reply.code(201).send(insight);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.post<InsightParams>(
    `${org}/lead-insights/:insightId/review`,
    canWrite,
    async (request, reply) => {
      if (!uuid.safeParse(request.params.insightId).success) return reply.code(404).send();
      const { accepted } = z.object({ accepted: z.boolean() }).parse(request.body);
      try {
        return await leadsService.review(
          request.auth!.userId,
          request.params.organizationId,
          request.params.insightId,
          accepted,
        );
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // Temperatura aceita de varios contatos de uma vez (cards do kanban).
  app.get<OrgParams>(`${org}/lead-insights/current`, canRead, async (request) => {
    const { contactIds } = currentQuery.parse(request.query);
    return leadsService.current(request.params.organizationId, contactIds);
  });
}
