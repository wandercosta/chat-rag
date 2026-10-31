import { db } from "../../db/client.js";
import type { TenantRole } from "../../db/types.js";

export const membersRepository = {
  /** Membros da organizacao com o e-mail do usuario — a tela de usuarios
   * precisa dos dois lados, e `memberships` sozinha so tem o id. */
  listForOrganization(organizationId: string) {
    return db
      .selectFrom("memberships as m")
      .innerJoin("users as u", "u.id", "m.user_id")
      .select(["m.id", "m.user_id", "m.role", "m.created_at", "u.email"])
      .where("m.organization_id", "=", organizationId)
      .orderBy("m.created_at", "asc")
      .execute();
  },

  listRoles() {
    return db.selectFrom("roles").select(["name", "description"]).orderBy("position").execute();
  },

  findByUserAndOrganization(organizationId: string, userId: string) {
    return db
      .selectFrom("memberships")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
  },

  findById(organizationId: string, membershipId: string) {
    return db
      .selectFrom("memberships")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", membershipId)
      .executeTakeFirst();
  },

  insert(trxDb: typeof db, organizationId: string, userId: string, role: TenantRole) {
    return trxDb
      .insertInto("memberships")
      .values({ organization_id: organizationId, user_id: userId, role })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  updateRole(organizationId: string, membershipId: string, role: TenantRole) {
    return db
      .updateTable("memberships")
      .set({ role })
      .where("organization_id", "=", organizationId)
      .where("id", "=", membershipId)
      .returningAll()
      .executeTakeFirst();
  },

  remove(organizationId: string, membershipId: string) {
    return db
      .deleteFrom("memberships")
      .where("organization_id", "=", organizationId)
      .where("id", "=", membershipId)
      .execute();
  },

  /** Quantos administradores a organizacao ainda tem — usado para impedir
   * que o ultimo seja rebaixado ou removido, deixando o tenant sem dono. */
  async countAdmins(organizationId: string): Promise<number> {
    const rows = await db
      .selectFrom("memberships")
      .select("id")
      .where("organization_id", "=", organizationId)
      .where("role", "=", "Administrador")
      .execute();
    return rows.length;
  },
};
