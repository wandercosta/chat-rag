import { db } from "../../db/client.js";
import { identityService } from "../identity/index.js";
import { auditService } from "../audit/index.js";
import { organizationsRepository } from "./repository.js";

export interface CreateTenantInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
}

export const organizationsService = {
  /**
   * Criacao atomica: nenhum tenant parcialmente criado pode ficar disponivel
   * para widget ou indexacao (docs/database/modelo-de-dados.md - Provisionamento).
   */
  async createTenant(masterUserId: string, input: CreateTenantInput) {
    return db.transaction().execute(async (trx) => {
      const organization = await organizationsRepository.insertOrganization(trx, input.name, input.slug);
      const adminUser = await identityService.createUser(trx, input.adminEmail, input.adminPassword);
      await organizationsRepository.insertMembership(trx, adminUser.id, organization.id, "Administrador");

      await auditService.record(
        {
          actorUserId: masterUserId,
          organizationId: organization.id,
          action: "Criou tenant",
          type: "seguranca",
          target: `${organization.name} · admin inicial ${adminUser.email}`,
        },
        trx,
      );

      return { organization, adminUser: { id: adminUser.id, email: adminUser.email } };
    });
  },

  listTenants() {
    return organizationsRepository.list();
  },

  /** Auto-atendimento do tenant (nao so Master): visao geral usa isso para
   * mostrar nome/status da propria organizacao. */
  getById(organizationId: string) {
    return organizationsRepository.findById(organizationId);
  },

  /** Suspensao bloqueia painel e widget sem apagar dados
   * (docs/database/modelo-de-dados.md - Provisionamento). Organizacao
   * inexistente conta como suspensa: nada operacional deve responder por ela. */
  async isSuspended(organizationId: string): Promise<boolean> {
    const organization = await organizationsRepository.findById(organizationId);
    return !organization || organization.status === "suspenso";
  },

  /** null = usa o padrao de plataforma (90 dias). Usado pelo modulo assistants
   * para resolver a politica efetiva de retencao (docs/security). */
  getRetentionDays(organizationId: string) {
    return organizationsRepository.findRetentionDays(organizationId);
  },

  async setRetentionDays(actorUserId: string, organizationId: string, days: number | null) {
    await organizationsRepository.setRetentionDays(organizationId, days);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Alterou politica de retencao da organizacao",
      type: "configuracao",
      target: days === null ? "padrao de plataforma (90 dias)" : `${days} dias`,
    });
  },

  async setStatus(masterUserId: string, organizationId: string, status: "ativo" | "suspenso") {
    await organizationsRepository.setStatus(organizationId, status);
    await auditService.record({
      actorUserId: masterUserId,
      organizationId,
      action: status === "suspenso" ? "Suspendeu tenant" : "Reativou tenant",
      type: "seguranca",
      target: organizationId,
    });
  },
};
