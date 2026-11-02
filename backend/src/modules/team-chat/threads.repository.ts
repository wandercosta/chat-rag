import { sql } from "kysely";
import { db } from "../../db/client.js";

export interface ThreadRow {
  id: string;
  kind: "geral" | "direto";
  user_a: string | null;
  user_b: string | null;
  last_message_at: Date | null;
  last_message: string | null;
  last_author_user_id: string | null;
  unread: string;
}

/** Par ordenado: a conversa direta entre A e B e a mesma entre B e A. */
export const orderedPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

export const threadsRepository = {
  /** O canal Geral nasce na primeira leitura de cada organizacao. */
  async ensureGeneral(organizationId: string) {
    await sql`
      insert into team_threads (organization_id, kind)
      values (${organizationId}, 'geral')
      on conflict (organization_id) where kind = 'geral' do nothing
    `.execute(db);
  },

  async findOrCreateDirect(organizationId: string, userA: string, userB: string) {
    const [a, b] = orderedPair(userA, userB);
    await sql`
      insert into team_threads (organization_id, kind, user_a, user_b)
      values (${organizationId}, 'direto', ${a}, ${b})
      on conflict (organization_id, user_a, user_b) where kind = 'direto' do nothing
    `.execute(db);
    return db
      .selectFrom("team_threads")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("kind", "=", "direto")
      .where("user_a", "=", a)
      .where("user_b", "=", b)
      .executeTakeFirstOrThrow();
  },

  /** Thread que a pessoa pode ler: o Geral ou uma direta em que ela esta. */
  findAccessible(organizationId: string, threadId: string, userId: string) {
    return db
      .selectFrom("team_threads")
      .selectAll()
      .where("id", "=", threadId)
      .where("organization_id", "=", organizationId)
      .where((eb) =>
        eb.or([eb("kind", "=", "geral"), eb("user_a", "=", userId), eb("user_b", "=", userId)]),
      )
      .executeTakeFirst();
  },

  /** Geral primeiro, depois as diretas pela ultima mensagem; com nao lidas. */
  listForUser(organizationId: string, userId: string) {
    return sql<ThreadRow>`
      select t.id, t.kind, t.user_a, t.user_b, t.last_message_at,
        last.content as last_message, last.author_user_id as last_author_user_id,
        (
          select count(*) from team_messages m
          where m.thread_id = t.id
            and m.author_user_id is distinct from ${userId}
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
        ) as unread
      from team_threads t
      left join team_thread_reads r on r.thread_id = t.id and r.user_id = ${userId}
      left join lateral (
        select left(m.content, 120) as content, m.author_user_id
        from team_messages m
        where m.thread_id = t.id
        order by m.created_at desc
        limit 1
      ) last on true
      where t.organization_id = ${organizationId}
        and (t.kind = 'geral' or t.user_a = ${userId} or t.user_b = ${userId})
      order by (t.kind = 'geral') desc, t.last_message_at desc nulls last, t.created_at desc
    `
      .execute(db)
      .then((r) => r.rows);
  },

  markRead(threadId: string, userId: string, at: Date) {
    return db
      .insertInto("team_thread_reads")
      .values({ thread_id: threadId, user_id: userId, last_read_at: at })
      .onConflict((oc) =>
        oc.columns(["thread_id", "user_id"]).doUpdateSet({
          last_read_at: sql`greatest(team_thread_reads.last_read_at, excluded.last_read_at)`,
        }),
      )
      .execute();
  },
};
