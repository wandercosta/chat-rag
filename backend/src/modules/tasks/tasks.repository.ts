import { sql } from "kysely";
import { db } from "../../db/client.js";

export type TaskStatus = "abertas" | "atrasadas" | "concluidas";

export interface TaskFilter {
  assigneeUserId?: string;
  status?: TaskStatus;
  contactId?: string;
  dealId?: string;
}

export interface TaskValues {
  title?: string;
  notes?: string | null;
  due_at?: Date | null;
  assignee_user_id?: string | null;
  contact_id?: string | null;
  deal_id?: string | null;
}

const columns = [
  "id",
  "title",
  "notes",
  "due_at",
  "assignee_user_id",
  "contact_id",
  "deal_id",
  "created_by",
  "done_at",
  "done_by",
  "created_at",
] as const;

export type TaskRow = Awaited<ReturnType<typeof tasksRepository.findById>> & object;

export const tasksRepository = {
  list(organizationId: string, filter: TaskFilter) {
    let query = db
      .selectFrom("tasks")
      .select(columns)
      .where("organization_id", "=", organizationId);
    if (filter.assigneeUserId) query = query.where("assignee_user_id", "=", filter.assigneeUserId);
    if (filter.contactId) query = query.where("contact_id", "=", filter.contactId);
    if (filter.dealId) query = query.where("deal_id", "=", filter.dealId);
    if (filter.status === "concluidas") {
      return query.where("done_at", "is not", null).orderBy("done_at", "desc").limit(200).execute();
    }
    query = query.where("done_at", "is", null);
    if (filter.status === "atrasadas") query = query.where("due_at", "<", new Date());
    // Abertas: prazo mais proximo primeiro; sem prazo no fim.
    return query
      .orderBy(sql`due_at asc nulls last`)
      .orderBy("created_at")
      .limit(500)
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom("tasks")
      .select(columns)
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  insert(organizationId: string, values: TaskValues & { title: string; created_by: string }) {
    return db
      .insertInto("tasks")
      .values({ organization_id: organizationId, ...values })
      .returning("id")
      .executeTakeFirstOrThrow();
  },

  update(
    organizationId: string,
    id: string,
    values: TaskValues & {
      done_at?: Date | null;
      done_by?: string | null;
      reminded_at?: Date | null;
    },
  ) {
    return db
      .updateTable("tasks")
      .set(values)
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  delete(organizationId: string, id: string) {
    return db
      .deleteFrom("tasks")
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
  },

  /**
   * Tarefas vencidas ainda sem aviso, marcadas na mesma instrucao: com dois
   * workers, cada tarefa e avisada uma vez so (skip locked). Sem responsavel
   * fica de fora, para avisar quem for definido depois.
   */
  claimDue(limit = 100) {
    return sql<{ id: string; organization_id: string; assignee_user_id: string | null }>`
      update tasks set reminded_at = now()
      where id in (
        select id from tasks
        where done_at is null and reminded_at is null and due_at <= now()
          and assignee_user_id is not null
        order by due_at
        limit ${limit}
        for update skip locked
      )
      returning id, organization_id, assignee_user_id
    `
      .execute(db)
      .then((r) => r.rows);
  },

  exportAll(organizationId: string) {
    return db
      .selectFrom("tasks")
      .select(columns)
      .where("organization_id", "=", organizationId)
      .execute();
  },
};
