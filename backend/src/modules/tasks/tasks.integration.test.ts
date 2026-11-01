import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";
import { remindDueTasks } from "./index.js";

/**
 * Tarefas com lembrete (ADR-008 #4): ligacao com contato e negocio, minhas e
 * de todos, concluir e reabrir, quem exclui, isolamento e aviso de prazo
 * uma vez so para o responsavel.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("tarefas", () => {
  let app: FastifyInstance;
  let masterCookie: string;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await createMaster(app);
  });

  afterAll(async () => {
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  const call = (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    cookie: string,
    payload?: object,
  ) => app.inject({ method, url, headers: { cookie }, payload });

  async function setup(slug: string) {
    const t = await createTenant(app, masterCookie, slug);
    const contact = (
      await call("POST", `${t.base}/contacts`, t.admin, {
        name: "Joao",
        email: `joao@${slug}.test`,
      })
    ).json();
    const [pipeline] = (await call("GET", `${t.base}/pipelines`, t.admin)).json();
    const deal = (
      await call("POST", `${t.base}/deals`, t.admin, {
        title: "Renovacao",
        pipelineId: pipeline.id,
        contactId: contact.id,
      })
    ).json();
    return { t, contact, deal };
  }

  it("cria ligada a contato e negocio, conclui, reabre e respeita quem exclui", async () => {
    const { t, contact, deal } = await setup("tarefa-a");
    const agent = t.people.Atendente;
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const mine = await call("POST", `${t.base}/tasks`, agent.cookie, {
      title: "Ligar para o Joao",
      dueAt: tomorrow,
      contactId: contact.id,
      dealId: deal.id,
    });
    expect(mine.statusCode).toBe(201);
    expect(mine.json()).toMatchObject({
      assigneeEmail: "atendente@tarefa-a.local",
      contactLabel: "Joao",
      dealTitle: "Renovacao",
      overdue: false,
    });
    const forAgent = (
      await call("POST", `${t.base}/tasks`, t.admin, {
        title: "Mandar proposta",
        assigneeUserId: agent.userId,
      })
    ).json();

    const agentOpen = (await call("GET", `${t.base}/tasks`, agent.cookie)).json();
    expect(agentOpen.map((x: { title: string }) => x.title)).toEqual([
      "Ligar para o Joao",
      "Mandar proposta",
    ]);
    expect((await call("GET", `${t.base}/tasks`, t.admin)).json()).toHaveLength(0);
    expect((await call("GET", `${t.base}/tasks?view=todas`, t.admin)).json()).toHaveLength(2);
    expect(
      (await call("GET", `${t.base}/tasks?contactId=${contact.id}`, t.admin)).json(),
    ).toHaveLength(1);

    const done = (
      await call("PATCH", `${t.base}/tasks/${mine.json().id}`, agent.cookie, { done: true })
    ).json();
    expect(done.doneByEmail).toBe("atendente@tarefa-a.local");
    expect(
      (await call("GET", `${t.base}/tasks?status=concluidas`, agent.cookie)).json(),
    ).toHaveLength(1);
    await call("PATCH", `${t.base}/tasks/${mine.json().id}`, agent.cookie, { done: false });
    expect((await call("GET", `${t.base}/tasks`, agent.cookie)).json()).toHaveLength(2);

    // Analista le, nao escreve; Atendente nao exclui tarefa que nao criou.
    const analyst = t.people.Analista.cookie;
    expect((await call("GET", `${t.base}/tasks?view=todas`, analyst)).statusCode).toBe(200);
    expect((await call("POST", `${t.base}/tasks`, analyst, { title: "x" })).statusCode).toBe(403);
    expect((await call("DELETE", `${t.base}/tasks/${forAgent.id}`, agent.cookie)).statusCode).toBe(
      403,
    );
    expect((await call("DELETE", `${t.base}/tasks/${forAgent.id}`, t.admin)).statusCode).toBe(204);
  });

  it("isola organizacoes", async () => {
    const a = await setup("tarefa-b");
    const b = await setup("tarefa-c");
    const task = (await call("POST", `${a.t.base}/tasks`, a.t.admin, { title: "De A" })).json();

    expect(
      (await call("PATCH", `${b.t.base}/tasks/${task.id}`, b.t.admin, { done: true })).statusCode,
    ).toBe(404);
    const bad = (payload: object) =>
      call("POST", `${b.t.base}/tasks`, b.t.admin, { title: "x", ...payload });
    expect((await bad({ contactId: a.contact.id })).statusCode).toBe(422);
    expect((await bad({ dealId: a.deal.id })).statusCode).toBe(422);
    expect((await bad({ assigneeUserId: a.t.people.Atendente.userId })).statusCode).toBe(422);
    expect((await call("GET", `${a.t.base}/tasks`, b.t.admin)).statusCode).toBe(403);
  });

  it("avisa o responsavel uma vez quando vence", async () => {
    const { t } = await setup("tarefa-d");
    const agent = t.people.Atendente;
    const past = new Date(Date.now() - 60_000).toISOString();
    const task = (
      await call("POST", `${t.base}/tasks`, t.admin, {
        title: "Retornar",
        dueAt: past,
        assigneeUserId: agent.userId,
      })
    ).json();
    expect(task.overdue).toBe(true);

    const events: { kind: string; taskId?: string; assigneeUserId?: string }[] = [];
    const unsubscribe = await realtime.subscribe(t.organizationId, (e) => events.push(e));
    expect(await remindDueTasks()).toBe(1);
    expect(await remindDueTasks()).toBe(0);
    for (let i = 0; i < 20 && events.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await unsubscribe();
    expect(events).toEqual([{ kind: "task_due", taskId: task.id, assigneeUserId: agent.userId }]);

    // Prazo novo volta a avisar.
    await call("PATCH", `${t.base}/tasks/${task.id}`, t.admin, { dueAt: past });
    expect(await remindDueTasks()).toBe(1);
    // Concluida nao avisa.
    await call("PATCH", `${t.base}/tasks/${task.id}`, agent.cookie, { dueAt: past, done: true });
    expect(await remindDueTasks()).toBe(0);
  });
});
