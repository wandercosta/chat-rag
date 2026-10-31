import { auditService } from "../audit/index.js";
import { membersService } from "../identity/index.js";
import type { TenantRole } from "../../db/types.js";
import { sectorsRepository } from "./sectors.repository.js";

export class SectorNotFoundError extends Error {}
export class DuplicateSectorError extends Error {}
/** So quem atende (Administrador ou Atendente) entra num setor. */
export class InvalidSectorMemberError extends Error {}

const AGENT_ROLES: readonly TenantRole[] = ["Administrador", "Atendente"];

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "23505";

async function agentIds(organizationId: string) {
  const members = await membersService.list(organizationId);
  return new Set(members.filter((m) => AGENT_ROLES.includes(m.role)).map((m) => m.user_id));
}

/** Setores da caixa de entrada: so o Administrador cria, renomeia e monta. */
export const sectorsService = {
  /** Quem saiu da organizacao (ou deixou de atender) some da lista. */
  async list(organizationId: string) {
    const [sectors, agents] = await Promise.all([
      sectorsRepository.list(organizationId),
      agentIds(organizationId),
    ]);
    return sectors.map((s) => ({ ...s, memberIds: s.memberIds.filter((id) => agents.has(id)) }));
  },

  async create(actorUserId: string, organizationId: string, name: string) {
    try {
      const sector = await sectorsRepository.create(organizationId, name);
      await auditService.record({
        actorUserId,
        organizationId,
        action: "Criou setor da caixa de entrada",
        type: "configuracao",
        target: name,
      });
      return { ...sector, memberIds: [] as string[] };
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateSectorError();
      throw err;
    }
  },

  async update(
    actorUserId: string,
    organizationId: string,
    id: string,
    changes: { name?: string; memberIds?: string[] },
  ) {
    const sector = await sectorsRepository.find(organizationId, id);
    if (!sector) throw new SectorNotFoundError();
    if (changes.memberIds) {
      const agents = await agentIds(organizationId);
      if (changes.memberIds.some((userId) => !agents.has(userId))) {
        throw new InvalidSectorMemberError();
      }
    }
    try {
      if (changes.name) await sectorsRepository.rename(organizationId, id, changes.name);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateSectorError();
      throw err;
    }
    if (changes.memberIds) {
      await sectorsRepository.setMembers(organizationId, id, [...new Set(changes.memberIds)]);
    }
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Alterou setor da caixa de entrada",
      type: "configuracao",
      target: changes.name ?? sector.name,
    });
    return (await this.list(organizationId)).find((s) => s.id === id)!;
  },

  async remove(actorUserId: string, organizationId: string, id: string) {
    const sector = await sectorsRepository.find(organizationId, id);
    if (!sector) throw new SectorNotFoundError();
    await sectorsRepository.remove(organizationId, id);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Excluiu setor da caixa de entrada",
      type: "configuracao",
      target: sector.name,
    });
  },

  /** Quem pode receber conversa (para transferir): so id, e-mail e papel. */
  async agents(organizationId: string) {
    const members = await membersService.list(organizationId);
    return members
      .filter((m) => AGENT_ROLES.includes(m.role))
      .map((m) => ({ userId: m.user_id, email: m.email, role: m.role }));
  },

  find: sectorsRepository.find,
  namesFor: sectorsRepository.namesFor,
  sectorIdsOf: sectorsRepository.sectorIdsOf,
  memberIds: sectorsRepository.memberIds,
};
