import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { WIDGET_ORIGIN, createMaster, createTenant } from "../../test/tenant-fixture.js";
import { signIdentityToken } from "./identity-token.js";

/**
 * Identidade assinada do visitante e aparencia padrao do widget: so token
 * valido retoma a conversa com o historico; identidade sem assinatura nao
 * le nem altera visitante verificado; a chave pode exigir assinatura.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("widget: identidade assinada e aparencia", () => {
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

  const start = (payload: object) =>
    app.inject({
      method: "POST",
      url: "/widget/conversations",
      headers: { origin: WIDGET_ORIGIN },
      payload,
    });
  const exp = () => Math.floor(Date.now() / 1000) + 600;

  it("so token assinado retoma a conversa e protege o visitante verificado", async () => {
    const t = await createTenant(app, masterCookie, "wid-a");
    const keys = (
      await app.inject({
        method: "GET",
        url: `${t.base}/widget-keys`,
        headers: { cookie: t.admin },
      })
    ).json();
    const keyId = keys[0].id as string;
    const secretUrl = `${t.base}/widget-keys/${keyId}/identity-secret`;

    expect(
      (
        await app.inject({
          method: "POST",
          url: secretUrl,
          headers: { cookie: t.people.Atendente.cookie },
        })
      ).statusCode,
    ).toBe(403);
    const created = await app.inject({
      method: "POST",
      url: secretUrl,
      headers: { cookie: t.admin },
    });
    expect(created.statusCode).toBe(201);
    const secret = created.json().secret as string;
    expect(secret).toMatch(/^wis_/);

    // A lista de chaves mostra so o final do segredo, nunca o texto nem o envelope.
    const listed = await app.inject({
      method: "GET",
      url: `${t.base}/widget-keys`,
      headers: { cookie: t.admin },
    });
    expect(listed.body).not.toContain(secret);
    expect(listed.body).not.toContain("ciphertext");
    expect(listed.json()[0]).not.toHaveProperty("key_hash");
    expect(listed.json()[0].identity_secret_hint).toBeTruthy();

    // Sem assinatura: o mesmo id externo nao retoma a conversa anterior.
    const unsigned = { key: t.key, externalUserId: "cliente-1", visitorName: "Maria" };
    const first = (await start(unsigned)).json();
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${first.conversationId}/messages`,
      headers: { origin: WIDGET_ORIGIN },
      payload: { key: t.key, message: "Meu CPF e 123" },
    });
    const again = await start(unsigned);
    expect(again.statusCode).toBe(201);
    expect(again.json()).toMatchObject({ isResumed: false, messages: [] });

    // Com token: identidade verificada e retomada com o historico.
    const token = signIdentityToken(
      { sub: "cliente-1", name: "Maria Verificada", email: "maria@x.com", exp: exp() },
      secret,
    );
    const signed = (await start({ key: t.key, identityToken: token })).json();
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${signed.conversationId}/messages`,
      headers: { origin: WIDGET_ORIGIN },
      payload: { key: t.key, message: "Oi de novo" },
    });
    const resumed = await start({ key: t.key, identityToken: token });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().isResumed).toBe(true);
    expect(resumed.json().conversationId).toBe(signed.conversationId);
    expect(JSON.stringify(resumed.json().messages)).toContain("Oi de novo");

    // Depois de verificado, o id sem assinatura vira anonimo e nao muda o cadastro.
    const spoof = await start({ ...unsigned, visitorName: "Invasor" });
    expect(spoof.json().isResumed).toBe(false);
    const visitor = await db
      .selectFrom("visitors")
      .select(["name", "identity_verified"])
      .where("external_user_id", "=", "cliente-1")
      .executeTakeFirstOrThrow();
    expect(visitor).toEqual({ name: "Maria Verificada", identity_verified: true });
    const spoofConversation = await db
      .selectFrom("conversations")
      .select("visitor_id")
      .where("id", "=", spoof.json().conversationId)
      .executeTakeFirstOrThrow();
    expect(spoofConversation.visitor_id).toBeNull();

    // Token invalido, vencido ou de outra chave: 401.
    expect((await start({ key: t.key, identityToken: `${token}x` })).statusCode).toBe(401);
    const expired = signIdentityToken({ sub: "cliente-1", exp: 1000 }, secret);
    expect((await start({ key: t.key, identityToken: expired })).statusCode).toBe(401);

    // Exigindo assinatura, os campos data-* sao ignorados.
    const require = (on: boolean) =>
      app.inject({
        method: "PATCH",
        url: `${t.base}/widget-keys/${keyId}`,
        headers: { cookie: t.admin },
        payload: { requireSignedIdentity: on },
      });
    expect((await require(true)).statusCode).toBe(200);
    const anonymous = (
      await start({ key: t.key, externalUserId: "cliente-2", visitorName: "Zé" })
    ).json();
    expect(
      (
        await db
          .selectFrom("visitors")
          .select("id")
          .where("external_user_id", "=", "cliente-2")
          .execute()
      ).length,
    ).toBe(0);
    expect(anonymous.conversationId).toBeTruthy();

    // Remover o segredo desliga a exigencia; exigir sem segredo da 422.
    await app.inject({ method: "DELETE", url: secretUrl, headers: { cookie: t.admin } });
    expect((await require(true)).statusCode).toBe(422);
    expect((await start({ key: t.key, identityToken: token })).statusCode).toBe(401);
  });

  it("junta a aparencia padrao da organizacao com a do assistente", async () => {
    const t = await createTenant(app, masterCookie, "wid-b");
    const put = (payload: object) =>
      app.inject({
        method: "PUT",
        url: `${t.base}/widget-defaults`,
        headers: { cookie: t.admin },
        payload,
      });
    expect((await put({ logoUrl: "http://inseguro.test/logo.png" })).statusCode).toBe(400);
    expect(
      (
        await put({
          title: "Loja B",
          accentColor: "#112233",
          logoUrl: "https://loja-b.test/logo.png",
        })
      ).statusCode,
    ).toBe(200);
    await app.inject({
      method: "PATCH",
      url: `${t.base}/assistants/${t.assistantId}`,
      headers: { cookie: t.admin },
      payload: { widgetSettings: { accentColor: "#AA0000", greeting: "Oi!" } },
    });
    const config = await app.inject({
      method: "POST",
      url: "/widget/config",
      headers: { origin: WIDGET_ORIGIN },
      payload: { key: t.key },
    });
    expect(config.json().appearance).toEqual({
      title: "Loja B",
      accentColor: "#AA0000",
      greeting: "Oi!",
      logoUrl: "https://loja-b.test/logo.png",
    });
  });
});
