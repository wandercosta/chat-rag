import { db } from "../../db/client.js";
import type { TenantRole } from "../../db/types.js";
import { auditService } from "../audit/index.js";
import { hashPassword } from "./crypto.js";
import { membersRepository } from "./members.repository.js";
import { identityRepository } from "./repository.js";

export class EmailAlreadyInOrganizationError extends Error {}
export class MemberNotFoundError extends Error {}
export class LastAdminError extends Error {}

export const membersService = {
  list(organizationId: string) {
    return membersRepository.listForOrganization(organizationId);
  },

  /**
   * Cria o acesso de um usuario ao tenant. Nao ha cadastro publico
   * (docs/security/privacidade-e-acesso.md): quem cria e sempre um
   * administrador da organizacao, definindo a senha provisoria. Se o e-mail ja
   * existir na plataforma (usuario de outro tenant), reaproveita o usuario e so
   * adiciona a associacao — sem tocar na senha dele.
   */
  async create(
    actorUserId: string,
    organizationId: string,
    input: { email: string; password: string; role: TenantRole },
  ) {
    const existingUser = await identityRepository.findUserByEmail(input.email);

    if (existingUser) {
      const alreadyMember = await membersRepository.findByUserAndOrganization(organizationId, existingUser.id);
      if (alreadyMember) throw new EmailAlreadyInOrganizationError();
    }

    const membership = await db.transaction().execute(async (trx) => {
      const user =
        existingUser ??
        (await identityRepository.insertUser(trx, {
          email: input.email,
          passwordHash: await hashPassword(input.password),
        }));

      const created = await membersRepository.insert(trx, organizationId, user.id, input.role);

      await auditService.record(
        {
          actorUserId,
          organizationId,
          action: "Criou acesso de usuario",
          type: "seguranca",
          target: `${input.email} · papel: ${input.role}`,
        },
        trx,
      );

      return created;
    });

    return membership;
  },

  async updateRole(actorUserId: string, organizationId: string, membershipId: string, role: TenantRole) {
    const membership = await membersRepository.findById(organizationId, membershipId);
    if (!membership) throw new MemberNotFoundError();

    // Rebaixar o unico administrador deixaria o tenant sem quem administra.
    if (membership.role === "Administrador" && role !== "Administrador") {
      const admins = await membersRepository.countAdmins(organizationId);
      if (admins <= 1) throw new LastAdminError();
    }

    const updated = await membersRepository.updateRole(organizationId, membershipId, role);

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Alterou papel de usuario",
      type: "seguranca",
      target: `${membershipId} · novo papel: ${role}`,
    });

    return updated;
  },

  async remove(actorUserId: string, organizationId: string, membershipId: string) {
    const membership = await membersRepository.findById(organizationId, membershipId);
    if (!membership) throw new MemberNotFoundError();

    if (membership.role === "Administrador") {
      const admins = await membersRepository.countAdmins(organizationId);
      if (admins <= 1) throw new LastAdminError();
    }

    await membersRepository.remove(organizationId, membershipId);

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Removeu acesso de usuario",
      type: "seguranca",
      target: membershipId,
    });
  },
};
