import type { AiLimitMode, RetentionMode } from "../../db/types.js";
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
      const organization = await organizationsRepository.insertOrganization(
        trx,
        input.name,
        input.slug,
      );
      const adminUser = await identityService.createUser(
        trx,
        input.adminEmail,
        input.adminPassword,
      );
      await organizationsRepository.insertMembership(
        trx,
        adminUser.id,
        organization.id,
        "Administrador",
      );

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
  /** Prazo (null = padrao da plataforma) e o que fazer ao vencer. */
  getRetentionPolicy(organizationId: string) {
    return organizationsRepository.findRetentionPolicy(organizationId);
  },

  async setRetentionPolicy(
    actorUserId: string,
    organizationId: string,
    days: number | null,
    mode?: RetentionMode,
  ) {
    await organizationsRepository.setRetentionPolicy(organizationId, days, mode);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Alterou politica de retencao da organizacao",
      type: "configuracao",
      target: `${days === null ? "padrao de plataforma (90 dias)" : `${days} dias`}${
        mode ? `, ${mode}` : ""
      }`,
    });
  },

  /** Teto da IA da plataforma (ADR-007): modo e tokens proprios, se houver. */
  async getAiLimit(organizationId: string) {
    const row = await organizationsRepository.findAiLimit(organizationId);
    return {
      mode: row?.ai_limit_mode ?? ("padrao" as AiLimitMode),
      tokens: row?.ai_monthly_tokens ? Number(row.ai_monthly_tokens) : null,
    };
  },

  /** So o Master define; o tenant apenas ve o consumo e o teto. */
  async setAiLimit(
    masterUserId: string,
    organizationId: string,
    mode: AiLimitMode,
    tokens: number | null,
  ) {
    const result = await organizationsRepository.setAiLimit(
      organizationId,
      mode,
      mode === "personalizado" ? tokens : null,
    );
    if (Number(result.numUpdatedRows) === 0) return false;
    await auditService.record({
      actorUserId: masterUserId,
      organizationId,
      action: "Alterou limite de IA da plataforma",
      type: "configuracao",
      target: mode === "personalizado" ? `${tokens} tokens por mes` : mode,
    });
    return true;
  },

  claimLimitNotice(organizationId: string, month: string) {
    return organizationsRepository.claimLimitNotice(organizationId, month);
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
