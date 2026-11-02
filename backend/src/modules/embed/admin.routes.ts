import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { auditService } from "../audit/index.js";
import { appearanceSchema, widgetDefaultsRepository } from "./appearance.js";
import {
  KeyNotFoundError,
  NoDomainsError,
  NoIdentitySecretError,
  keysService,
} from "./keys.service.js";

const roles = ["Administrador"] as const;

const createSchema = z.object({
  assistantId: z.string().uuid(),
  environment: z.enum(["teste", "producao"]),
  domains: z.array(z.string().min(1)).min(1),
});

const domainSchema = z.object({ domain: z.string().min(1) });

export async function embedAdminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/widget-keys",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      return keysService.list(request.params.organizationId);
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/widget-keys",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      try {
        const key = await keysService.create(
          request.auth!.userId,
          request.params.organizationId,
          body.assistantId,
          body.environment,
          body.domains,
        );
        return reply.code(201).send(key);
      } catch (err) {
        if (err instanceof NoDomainsError) {
          return reply.code(422).send({ error: "ao menos um dominio permitido e obrigatorio" });
        }
        throw err;
      }
    },
  );

  type KeyParams = { Params: { organizationId: string; keyId: string } };
  const keyErrors = (err: unknown, reply: FastifyReply) => {
    if (err instanceof KeyNotFoundError)
      return reply.code(404).send({ error: "chave nao encontrada" });
    if (err instanceof NoIdentitySecretError)
      return reply.code(422).send({ error: "gere o segredo de identidade antes de exigir" });
    throw err;
  };

  // Segredo de identidade (token assinado do visitante): o texto so sai aqui.
  app.post<KeyParams>(
    "/organizations/:organizationId/widget-keys/:keyId/identity-secret",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      try {
        const secret = await keysService.rotateIdentitySecret(
          request.auth!.userId,
          request.params.organizationId,
          request.params.keyId,
        );
        return reply.code(201).send(secret);
      } catch (err) {
        return keyErrors(err, reply);
      }
    },
  );

  app.delete<KeyParams>(
    "/organizations/:organizationId/widget-keys/:keyId/identity-secret",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      try {
        await keysService.removeIdentitySecret(
          request.auth!.userId,
          request.params.organizationId,
          request.params.keyId,
        );
        return reply.code(204).send();
      } catch (err) {
        return keyErrors(err, reply);
      }
    },
  );

  app.patch<KeyParams>(
    "/organizations/:organizationId/widget-keys/:keyId",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = z.object({ requireSignedIdentity: z.boolean() }).parse(request.body);
      try {
        await keysService.setRequireSignedIdentity(
          request.auth!.userId,
          request.params.organizationId,
          request.params.keyId,
          body.requireSignedIdentity,
        );
        return { requireSignedIdentity: body.requireSignedIdentity };
      } catch (err) {
        return keyErrors(err, reply);
      }
    },
  );

  // Aparencia padrao do widget da organizacao (o assistente sobrescreve).
  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/widget-defaults",
    { preHandler: requireOrgRole(roles) },
    async (request) => widgetDefaultsRepository.get(request.params.organizationId),
  );

  app.put<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/widget-defaults",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      const settings = appearanceSchema.parse(request.body);
      await widgetDefaultsRepository.save(request.params.organizationId, settings);
      await auditService.record({
        actorUserId: request.auth!.userId,
        organizationId: request.params.organizationId,
        action: "Alterou a aparencia padrao do widget",
        type: "configuracao",
        target: "widget",
      });
      return settings;
    },
  );

  app.post<{ Params: { organizationId: string; keyId: string } }>(
    "/organizations/:organizationId/widget-keys/:keyId/revoke",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      await keysService.revoke(
        request.auth!.userId,
        request.params.organizationId,
        request.params.keyId,
      );
      return { ok: true };
    },
  );

  app.post<{ Params: { organizationId: string; keyId: string } }>(
    "/organizations/:organizationId/widget-keys/:keyId/domains",
    { preHandler: requireOrgRole(roles) },
    async (request, reply) => {
      const body = domainSchema.parse(request.body);
      await keysService.addDomain(request.params.keyId, body.domain);
      return reply.code(201).send({ ok: true });
    },
  );

  app.delete<{ Params: { organizationId: string; keyId: string; domainId: string } }>(
    "/organizations/:organizationId/widget-keys/:keyId/domains/:domainId",
    { preHandler: requireOrgRole(roles) },
    async (request) => {
      await keysService.removeDomain(request.params.keyId, request.params.domainId);
      return { ok: true };
    },
  );
}
