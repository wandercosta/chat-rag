import { db } from "../../db/client.js";

/** Setores da caixa de entrada e quem atende em cada um. */
export const sectorsRepository = {
  async list(organizationId: string) {
    const [sectors, members] = await Promise.all([
      db
        .selectFrom("inbox_sectors")
        .select(["id", "name", "created_at"])
        .where("organization_id", "=", organizationId)
        .orderBy("name")
        .execute(),
      db
        .selectFrom("inbox_sector_members")
        .select(["sector_id", "user_id"])
        .where("organization_id", "=", organizationId)
        .execute(),
    ]);
    return sectors.map((s) => ({
      ...s,
      memberIds: members.filter((m) => m.sector_id === s.id).map((m) => m.user_id),
    }));
  },

  find(organizationId: string, id: string) {
    return db
      .selectFrom("inbox_sectors")
      .select(["id", "name"])
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  /** Nomes por id, para a fila e o detalhe da conversa. */
  async namesFor(organizationId: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const rows = await db
      .selectFrom("inbox_sectors")
      .select(["id", "name"])
      .where("organization_id", "=", organizationId)
      .where("id", "in", ids)
      .execute();
    return new Map(rows.map((r) => [r.id, r.name]));
  },

  async sectorIdsOf(organizationId: string, userId: string) {
    const rows = await db
      .selectFrom("inbox_sector_members")
      .select("sector_id")
      .where("organization_id", "=", organizationId)
      .where("user_id", "=", userId)
      .execute();
    return rows.map((r) => r.sector_id);
  },

  async memberIds(organizationId: string, sectorId: string) {
    const rows = await db
      .selectFrom("inbox_sector_members")
      .select("user_id")
      .where("organization_id", "=", organizationId)
      .where("sector_id", "=", sectorId)
      .execute();
    return rows.map((r) => r.user_id);
  },

  create(organizationId: string, name: string) {
    return db
      .insertInto("inbox_sectors")
      .values({ organization_id: organizationId, name })
      .returning(["id", "name", "created_at"])
      .executeTakeFirstOrThrow();
  },

  async rename(organizationId: string, id: string, name: string) {
    const r = await db
      .updateTable("inbox_sectors")
      .set({ name })
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(r.numUpdatedRows) > 0;
  },

  /** Troca a lista inteira de quem atende no setor. */
  async setMembers(organizationId: string, sectorId: string, userIds: string[]) {
    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("inbox_sector_members")
        .where("organization_id", "=", organizationId)
        .where("sector_id", "=", sectorId)
        .execute();
      if (userIds.length > 0) {
        await trx
          .insertInto("inbox_sector_members")
          .values(
            userIds.map((userId) => ({
              sector_id: sectorId,
              user_id: userId,
              organization_id: organizationId,
            })),
          )
          .execute();
      }
    });
  },

  /** Conversas do setor voltam a fila geral (ON DELETE SET NULL). */
  async remove(organizationId: string, id: string) {
    const r = await db
      .deleteFrom("inbox_sectors")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(r.numDeletedRows) > 0;
  },
};
