import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";

type Stage = { id: string; name: string; kind: string };
type Pipeline = { id: string; name: string; stages: Stage[] };

/**
 * Funil de vendas (ADR-008): funil padrao, kanban (etapa e posicao), ganho e
 * perda, historico, papeis, isolamento entre organizacoes e Master so lendo.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("funil de vendas", () => {
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
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    cookie: string,
    payload?: object,
  ) => app.inject({ method, url, headers: { cookie }, payload });

  async function setup(slug: string) {
    const t = await createTenant(app, masterCookie, slug);
    const [pipeline] = (await call("GET", `${t.base}/pipelines`, t.admin)).json() as Pipeline[];
    const contact = (
      await call("POST", `${t.base}/contacts`, t.admin, {
        name: "Maria Cliente",
        email: `maria@${slug}.test`,
      })
    ).json();
    const stage = (name: string) => pipeline.stages.find((s) => s.name === name)!;
    return { t, pipeline, contact, stage };
  }

  it("cria no funil padrao, move no kanban e fecha como ganho", async () => {
    const { t, pipeline, contact, stage } = await setup("funil-a");
    expect(pipeline.stages.map((s) => s.kind)).toEqual([
      "aberta",
      "aberta",
      "aberta",
      "aberta",
      "ganho",
      "perdido",
    ]);

    const create = (title: string, cookie = t.admin) =>
      call("POST", `${t.base}/deals`, cookie, {
        title,
        pipelineId: pipeline.id,
        contactId: contact.id,
        valueCents: 150000,
        expectedCloseDate: "2026-12-15",
      });
    const deal = (await create("Plano anual")).json();
    expect(deal).toMatchObject({
      stageId: stage("Novo").id,
      status: "aberto",
      contactLabel: "Maria Cliente",
      ownerEmail: "admin@funil-a.local",
      valueCents: 150000,
      expectedCloseDate: "2026-12-15",
    });
    const second = (await create("Plano mensal", t.people.Atendente.cookie)).json();
    const third = (await create("Consultoria")).json();

    // Kanban: o terceiro vai para o topo da coluna Novo.
    await call("POST", `${t.base}/deals/${third.id}/move`, t.people.Atendente.cookie, {
      stageId: stage("Novo").id,
      position: 0,
    });
    const novo = (
      await call("GET", `${t.base}/deals?stageId=${stage("Novo").id}`, t.admin)
    ).json() as { id: string }[];
    expect(novo.map((d) => d.id)).toEqual([third.id, deal.id, second.id]);

    const proposal = await call("POST", `${t.base}/deals/${deal.id}/move`, t.admin, {
      stageId: stage("Proposta").id,
    });
    expect(proposal.json()).toMatchObject({ stageId: stage("Proposta").id, status: "aberto" });
    const won = (
      await call("POST", `${t.base}/deals/${deal.id}/move`, t.admin, { stageId: stage("Ganho").id })
    ).json();
    expect(won.status).toBe("ganho");
    expect(won.closedAt).not.toBeNull();
    expect(won.history).toHaveLength(3);

    const lost = (
      await call("POST", `${t.base}/deals/${second.id}/move`, t.admin, {
        stageId: stage("Perdido").id,
        lostReason: "Preco",
      })
    ).json();
    expect(lost).toMatchObject({ status: "perdido", lostReason: "Preco" });

    // Analista le, nao escreve; Editor de base nao ve o funil.
    const analyst = t.people.Analista.cookie;
    expect((await call("GET", `${t.base}/deals/${deal.id}`, analyst)).statusCode).toBe(200);
    expect((await create("Do analista", analyst)).statusCode).toBe(403);
    expect(
      (await call("GET", `${t.base}/deals`, t.people["Editor de base"].cookie)).statusCode,
    ).toBe(403);
    // Excluir negocio e so do Administrador.
    expect(
      (await call("DELETE", `${t.base}/deals/${third.id}`, t.people.Atendente.cookie)).statusCode,
    ).toBe(403);
    expect((await call("DELETE", `${t.base}/deals/${third.id}`, t.admin)).statusCode).toBe(204);

    const audit = await db
      .selectFrom("audit_events")
      .select(["action", "target"])
      .where("organization_id", "=", t.organizationId)
      .where("action", "like", "%negocio%")
      .execute();
    expect(audit.map((a) => a.action)).toContain("Marcou negocio como ganho");
    expect(JSON.stringify(audit)).not.toContain("Maria");
  });

  it("isola organizacoes e deixa o Master so ler", async () => {
    const a = await setup("funil-b");
    const b = await setup("funil-c");
    const deal = (
      await call("POST", `${a.t.base}/deals`, a.t.admin, {
        title: "Negocio de A",
        pipelineId: a.pipeline.id,
      })
    ).json();

    expect((await call("GET", `${b.t.base}/deals/${deal.id}`, b.t.admin)).statusCode).toBe(404);
    expect((await call("GET", `${a.t.base}/deals`, b.t.admin)).statusCode).toBe(403);
    // Contato, responsavel, funil e etapa de outra organizacao: 422.
    const bad = (payload: object) =>
      call("POST", `${b.t.base}/deals`, b.t.admin, {
        title: "x",
        pipelineId: b.pipeline.id,
        ...payload,
      });
    expect((await bad({ contactId: a.contact.id })).statusCode).toBe(422);
    expect((await bad({ ownerUserId: a.t.people.Atendente.userId })).statusCode).toBe(422);
    expect((await bad({ pipelineId: a.pipeline.id })).statusCode).toBe(422);
    expect((await bad({ stageId: a.stage("Novo").id })).statusCode).toBe(422);
    // Analista nao pode ser responsavel.
    expect((await bad({ ownerUserId: b.t.people.Analista.userId })).statusCode).toBe(422);
    expect(
      (
        await call("POST", `${b.t.base}/deals/${deal.id}/move`, b.t.admin, {
          stageId: b.stage("Ganho").id,
        })
      ).statusCode,
    ).toBe(404);

    await call("POST", `/master/tenants/${a.t.organizationId}/support-sessions`, masterCookie, {
      justification: "Conferir o funil de vendas do tenant",
    });
    expect((await call("GET", `${a.t.base}/deals`, masterCookie)).statusCode).toBe(200);
    expect(
      (
        await call("POST", `${a.t.base}/deals`, masterCookie, {
          title: "Do master",
          pipelineId: a.pipeline.id,
        })
      ).statusCode,
    ).toBe(403);
  });

  it("funis e etapas: so o Administrador configura e as regras seguram", async () => {
    const { t, pipeline, stage } = await setup("funil-d");
    expect(
      (await call("POST", `${t.base}/pipelines`, t.people.Atendente.cookie, { name: "Pos-venda" }))
        .statusCode,
    ).toBe(403);
    const created = await call("POST", `${t.base}/pipelines`, t.admin, { name: "Pos-venda" });
    expect(created.statusCode).toBe(201);

    const extra = (
      await call("POST", `${t.base}/pipelines/${pipeline.id}/stages`, t.admin, {
        name: "Contrato",
        kind: "aberta",
      })
    ).json();
    const ids = [extra.id, ...pipeline.stages.map((s) => s.id)];
    expect(
      (
        await call("PUT", `${t.base}/pipelines/${pipeline.id}/stage-order`, t.admin, {
          stageIds: ids.slice(1),
        })
      ).statusCode,
    ).toBe(409);
    await call("PUT", `${t.base}/pipelines/${pipeline.id}/stage-order`, t.admin, { stageIds: ids });
    const [reloaded] = (await call("GET", `${t.base}/pipelines`, t.admin)).json() as Pipeline[];
    expect(reloaded.stages[0].name).toBe("Contrato");

    await call("POST", `${t.base}/deals`, t.admin, {
      title: "Ocupa a etapa",
      pipelineId: pipeline.id,
      stageId: extra.id,
    });
    expect(
      (await call("DELETE", `${t.base}/pipeline-stages/${extra.id}`, t.admin)).statusCode,
    ).toBe(409);
    expect(
      (await call("DELETE", `${t.base}/pipeline-stages/${stage("Ganho").id}`, t.admin)).statusCode,
    ).toBe(409);
    expect((await call("DELETE", `${t.base}/pipelines/${pipeline.id}`, t.admin)).statusCode).toBe(
      409,
    );
    expect(
      (await call("DELETE", `${t.base}/pipelines/${created.json().id}`, t.admin)).statusCode,
    ).toBe(204);
  });
});
