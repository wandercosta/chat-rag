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
