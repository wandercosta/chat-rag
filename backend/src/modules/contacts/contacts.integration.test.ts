import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import {
  createMaster,
  createTenant as createTenantWith,
  startWidgetConversation,
} from "../../test/tenant-fixture.js";

/**
 * CRM de contatos (ADR-006, etapa 3): visitante identificado vira contato,
 * cadastro com duplicados e opt-in, etiquetas e segmentos, importacao e
 * exportacao CSV, exclusao LGPD, papeis e isolamento entre tenants.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("contatos", () => {
  let app: FastifyInstance;
  let masterCookie: string;

  const createTenant = (slug: string) => createTenantWith(app, masterCookie, slug);

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

  it("transforma o visitante identificado em contato e reaproveita nas visitas seguintes", async () => {
    const t = await createTenant("loja-a");
    const first = await startWidgetConversation(app, t.key, {
      externalUserId: "pedido-1",
      visitorName: "Maria",
      visitorEmail: "Maria@Exemplo.com",
    });
    // Outro visitante (outro id externo), mesmo e-mail: mesmo contato.
    const second = await startWidgetConversation(app, t.key, {
      externalUserId: "pedido-2",
      visitorEmail: "maria@exemplo.com",
    });
    // Anonimo nao vira contato.
    await startWidgetConversation(app, t.key);

    const list = await app.inject({
      method: "GET",
      url: `${t.base}/contacts`,
      headers: { cookie: t.admin },
    });
    expect(list.json().total).toBe(1);
    const contact = list.json().items[0];
    expect(contact).toMatchObject({ name: "Maria", email: "maria@exemplo.com" });

    const detail = await app.inject({
      method: "GET",
      url: `${t.base}/contacts/${contact.id}`,
      headers: { cookie: t.people.Atendente.cookie },
    });
    expect(detail.json().identities).toHaveLength(2);
    expect(
      detail
        .json()
        .conversations.map((c: { id: string }) => c.id)
        .sort(),
    ).toEqual([first.json().conversationId, second.json().conversationId].sort());

    // A fila da caixa de entrada mostra o nome do contato.
    const inbox = await app.inject({
      method: "GET",
      url: `${t.base}/inbox?view=assistente`,
      headers: { cookie: t.admin },
    });
    const labels = inbox.json().map((c: { contact_label: string | null }) => c.contact_label);
    expect(labels).toContain("Maria");
  });

  it("valida duplicados, registra opt-in e opt-out e filtra por etiqueta e segmento", async () => {
    const t = await createTenant("loja-b");
    const headers = { cookie: t.admin };
    const post = (url: string, payload: object) =>
      app.inject({ method: "POST", url: `${t.base}${url}`, headers, payload });

    const vip = (await post("/contact-tags", { name: "VIP" })).json();
    const sp = (await post("/contact-tags", { name: "Sao Paulo" })).json();
    await post("/contact-fields", { label: "Plano" });

    const ana = await post("/contacts", {
      name: "Ana",
      phone: "(11) 98888-7777",
      optIn: true,
      tagIds: [vip.id, sp.id],
      customFields: { plano: "Pro" },
    });
    expect(ana.statusCode).toBe(201);
    expect(ana.json()).toMatchObject({ phone: "+5511988887777", opt_in_source: "painel" });

    const duplicate = await post("/contacts", { name: "Outra", phone: "+55 11 98888-7777" });
    expect(duplicate.statusCode).toBe(409);
    const invalid = await post("/contacts", { email: "sem-arroba" });
    expect(invalid.statusCode).toBe(422);

    await post("/contacts", { name: "Bruno", email: "bruno@x.com", tagIds: [vip.id] });

    const query = (qs: string) =>
      app.inject({ method: "GET", url: `${t.base}/contacts?${qs}`, headers });
    expect((await query(`tagIds=${vip.id},${sp.id}&tagMatch=all`)).json().total).toBe(1);
    expect((await query(`tagIds=${vip.id},${sp.id}&tagMatch=any`)).json().total).toBe(2);
    expect((await query("optIn=true")).json().items[0].name).toBe("Ana");
    expect((await query("search=988887")).json().total).toBe(1);

    const segment = await post("/contact-segments", {
      name: "VIP com plano Pro",
      filter: { tagIds: [vip.id], fields: [{ key: "plano", value: "Pro" }] },
    });
    expect((await query(`segmentId=${segment.json().id}`)).json().items).toEqual([
      expect.objectContaining({ name: "Ana" }),
    ]);

    // Opt-out vence o opt-in.
    const out = await app.inject({
      method: "PATCH",
      url: `${t.base}/contacts/${ana.json().id}`,
      headers,
      payload: { optIn: false },
    });
    expect(out.json().opted_out_at).not.toBeNull();
    expect((await query("optIn=true")).json().total).toBe(0);
  });

  it("importa CSV com relatorio de erros, sem desfazer opt-out, e exporta sem formula", async () => {
    const t = await createTenant("loja-c");
    const headers = { cookie: t.admin };
    await app.inject({
      method: "POST",
      url: `${t.base}/contact-fields`,
      headers,
      payload: { label: "Cidade" },
    });
    const saiu = await app.inject({
      method: "POST",
      url: `${t.base}/contacts`,
      headers,
      payload: { name: "Saiu", email: "saiu@x.com", optIn: true },
    });
    await app.inject({
      method: "PATCH",
      url: `${t.base}/contacts/${saiu.json().id}`,
      headers,
      payload: { optIn: false },
    });

    const csv = [
      "Nome;E-mail;Telefone;Etiquetas;Opt-in;Cidade;Coluna estranha",
      "Carla;carla@x.com;(21) 97777-6666;VIP|Rio;sim;Rio;x",
      "Saiu de novo;saiu@x.com;;;sim;;",
      "Sem contato;;;;;;",
      "Errado;nao-e-email;;;;;",
      "=HYPERLINK(1);hack@x.com;;;;;",
    ].join("\r\n");
    const imported = await app.inject({
      method: "POST",
      url: `${t.base}/contacts/import`,
      headers,
      payload: { csv },
    });
    expect(imported.json()).toEqual({
      created: 2,
      updated: 1,
      errors: [
        { line: 4, message: "sem e-mail nem telefone" },
        { line: 5, message: "e-mail invalido: nao-e-email" },
      ],
      ignoredColumns: ["Coluna estranha"],
    });

    const carla = (
      await app.inject({ method: "GET", url: `${t.base}/contacts?search=carla`, headers })
    ).json().items[0];
    expect(carla).toMatchObject({
      phone: "+5521977776666",
      opt_in_source: "importacao",
      custom_fields: { cidade: "Rio" },
    });
    expect(carla.tags.map((tag: { name: string }) => tag.name)).toEqual(["Rio", "VIP"]);

    const stillOut = (
      await app.inject({ method: "GET", url: `${t.base}/contacts?search=saiu`, headers })
    ).json().items[0];
    expect(stillOut.opted_out_at).not.toBeNull();

    const exported = await app.inject({
      method: "GET",
      url: `${t.base}/contacts/export`,
      headers,
    });
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.body).toContain(
      "nome;email;telefone;etiquetas;opt_in;opt_in_origem;criado_em;cidade",
    );
    expect(exported.body).toContain("'=HYPERLINK(1)");

    const audit = await app.inject({ method: "GET", url: `${t.base}/audit`, headers });
    const actions = audit.json().map((e: { action: string }) => e.action);
    expect(actions).toContain("Exportou 3 contato(s)");
  });

  it("exclui o contato com as conversas e respeita papeis e isolamento", async () => {
    const a = await createTenant("loja-d");
    const b = await createTenant("loja-e");
    const conversation = await startWidgetConversation(app, a.key, {
      visitorEmail: "lgpd@x.com",
    });
    const contactId = (
      await app.inject({ method: "GET", url: `${a.base}/contacts`, headers: { cookie: a.admin } })
    ).json().items[0].id;

    const asAnalyst = await app.inject({
      method: "POST",
      url: `${a.base}/contacts`,
      headers: { cookie: a.people.Analista.cookie },
      payload: { email: "x@x.com" },
    });
    expect(asAnalyst.statusCode).toBe(403);
    const exportAsAgent = await app.inject({
      method: "GET",
      url: `${a.base}/contacts/export`,
      headers: { cookie: a.people.Atendente.cookie },
    });
    expect(exportAsAgent.statusCode).toBe(403);

    const crossTenant = await app.inject({
      method: "GET",
      url: `${a.base}/contacts/${contactId}`,
      headers: { cookie: b.admin },
    });
    expect(crossTenant.statusCode).toBe(403);
    const viaOwnTenant = await app.inject({
      method: "DELETE",
      url: `${b.base}/contacts/${contactId}`,
      headers: { cookie: b.admin },
    });
    expect(viaOwnTenant.statusCode).toBe(404);

    const removed = await app.inject({
      method: "DELETE",
      url: `${a.base}/contacts/${contactId}`,
      headers: { cookie: a.admin },
    });
    expect(removed.statusCode).toBe(204);
    const gone = await app.inject({
      method: "GET",
      url: `${a.base}/conversations/${conversation.json().conversationId}`,
      headers: { cookie: a.admin },
    });
    expect(gone.statusCode).toBe(404);
  });

  it("salva como contato a partir da conversa e junta com contato existente", async () => {
    const t = await createTenant("loja-f");
    const headers = { cookie: t.people.Atendente.cookie };
    const anonymous = (await startWidgetConversation(app, t.key)).json().conversationId;

    const saved = await app.inject({
      method: "POST",
      url: `${t.base}/contacts/from-conversation`,
      headers,
      payload: { conversationId: anonymous, name: "Joao", phone: "11 97777-1111" },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().merged).toBe(false);

    const again = await app.inject({
      method: "POST",
      url: `${t.base}/contacts/from-conversation`,
      headers,
      payload: { conversationId: anonymous, name: "Joao" },
    });
    expect(again.statusCode).toBe(409);

    const other = (await startWidgetConversation(app, t.key)).json().conversationId;
    const merged = await app.inject({
      method: "POST",
      url: `${t.base}/contacts/from-conversation`,
      headers,
      payload: { conversationId: other, phone: "+5511977771111" },
    });
    expect(merged.statusCode).toBe(200);
    expect(merged.json().contact.id).toBe(saved.json().contact.id);
  });
});
