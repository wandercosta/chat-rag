import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditService } from "../audit/index.js";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { mailer } from "../../mail/mailer.js";
import { settingsRepository } from "./settings.repository.js";

const settingsSchema = z.object({
  firstResponseMinutes: z.number().int().min(1).max(10080).nullable(),
  emailOnAssignment: z.boolean(),
});

type OrgParams = { Params: { organizationId: string } };

/**
 * Meta de primeira resposta (SLA) e e-mail para quem recebe conversa. Quem
 * atende le (a fila mostra o prazo); so o Administrador muda. `emailAvailable`
 * diz se a plataforma tem SMTP: sem ele, ligar o e-mail nao tem efeito.
 */
export async function inboxSettingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const path = "/organizations/:organizationId/inbox-settings";

  app.get<OrgParams>(
    path,
    { preHandler: requireOrgRole(["Administrador", "Atendente", "Analista"]) },
    async (request) => ({
      ...(await settingsRepository.get(request.params.organizationId)),
      emailAvailable: mailer.enabled(),
    }),
  );

  app.put<OrgParams>(path, { preHandler: requireOrgRole(["Administrador"]) }, async (request) => {
    const body = settingsSchema.parse(request.body);
    await settingsRepository.save(request.params.organizationId, body);
    await auditService.record({
      actorUserId: request.auth!.userId,
      organizationId: request.params.organizationId,
      action: "Alterou configuracao da caixa de entrada",
      type: "configuracao",
      target: body.firstResponseMinutes ? `SLA ${body.firstResponseMinutes} min` : "sem SLA",
    });
    return { ...body, emailAvailable: mailer.enabled() };
  });
}
