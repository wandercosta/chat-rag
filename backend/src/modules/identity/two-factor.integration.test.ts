import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Liga a exigencia de 2FA para o Master so neste arquivo (antes de importar a app).
vi.hoisted(() => {
  process.env.MASTER_2FA_REQUIRED = "true";
});

const { buildApp } = await import("../../app.js");
const { db } = await import("../../db/client.js");
const { redis } = await import("../../db/redis.js");
const { realtime } = await import("../../realtime/events.js");
const { identityService } = await import("./index.js");
const { RUN_INTEGRATION_TESTS, resetDatabase } = await import("../../test/integration-helpers.js");
const { cookieFrom, startWidgetConversation } = await import("../../test/tenant-fixture.js");
const { timeStep, totpAt } = await import("./totp.js");

/**
 * Etapa 8 (ADR-006): verificacao em duas etapas com codigo do app e de
 * recuperacao, sem reuso do mesmo codigo, limite de tentativas por e-mail,
 * Master obrigado a ter 2FA quando MASTER_2FA_REQUIRED esta ligado, e a
 * exportacao LGPD da organizacao.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("2FA e exportacao LGPD", () => {
  let app: FastifyInstance;

  const login = (email: string, password: string, code?: string) =>
    app.inject({ method: "POST", url: "/auth/login", payload: { email, password, code } });

  beforeEach(async () => {
    await resetDatabase();
    for (const key of await redis.keys("login-fail:*")) await redis.del(key);
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  /** Master com 2FA ativo; devolve o cookie e o segredo. */
  async function masterWith2fa() {
    const master = await identityService.createUser(db, "master@teste.local", "senha-master-123");
    await db.insertInto("platform_roles").values({ user_id: master.id }).execute();
    let cookie = cookieFrom(await login("master@teste.local", "senha-master-123"));

    // Sem 2FA, o Master nao age.
    const blocked = await app.inject({
      method: "GET",
      url: "/master/tenants",
      headers: { cookie },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().twoFactorSetupRequired).toBe(true);

    const setup = (
      await app.inject({ method: "POST", url: "/auth/2fa/setup", headers: { cookie } })
    ).json();
    expect(setup.otpauthUrl).toContain("otpauth://totp/ChatRAG");
    const enabled = await app.inject({
      method: "POST",
      url: "/auth/2fa/enable",
      headers: { cookie },
      payload: { code: totpAt(setup.secret, timeStep()) },
    });
    expect(enabled.json().recoveryCodes).toHaveLength(10);

    // Proximo passo de tempo: o codigo usado na ativacao nao vale de novo.
    cookie = cookieFrom(
      await login("master@teste.local", "senha-master-123", totpAt(setup.secret, timeStep() + 1)),
    );
    return { cookie, secret: setup.secret, recoveryCodes: enabled.json().recoveryCodes };
  }

  it("exige o codigo no login, recusa reuso e aceita codigo de recuperacao uma vez", async () => {
    const { cookie, secret, recoveryCodes } = await masterWith2fa();
    const allowed = await app.inject({
      method: "GET",
      url: "/master/tenants",
      headers: { cookie },
    });
    expect(allowed.statusCode).toBe(200);

    const noCode = await login("master@teste.local", "senha-master-123");
    expect(noCode.statusCode).toBe(401);
    expect(noCode.json().twoFactorRequired).toBe(true);

    // O mesmo codigo (ja usado acima) nao entra de novo.
    const replay = await login(
      "master@teste.local",
      "senha-master-123",
      totpAt(secret, timeStep() + 1),
    );
    expect(replay.statusCode).toBe(401);

    const recovery = await login("master@teste.local", "senha-master-123", recoveryCodes[0]);
    expect(recovery.statusCode).toBe(200);
    const again = await login("master@teste.local", "senha-master-123", recoveryCodes[0]);
    expect(again.statusCode).toBe(401);

    const status = await app.inject({
      method: "GET",
      url: "/auth/2fa",
      headers: { cookie },
    });
    expect(status.json()).toMatchObject({ enabled: true, recoveryCodesLeft: 9 });
  });

  it("bloqueia depois de 10 erros seguidos para o mesmo e-mail", async () => {
    await identityService.createUser(db, "ana@teste.local", "senha-certa-123");
    for (let i = 0; i < 10; i++) {
      expect((await login("ana@teste.local", "errada")).statusCode).toBe(401);
    }
    expect((await login("ana@teste.local", "senha-certa-123")).statusCode).toBe(429);
  });

  it("exporta os dados da organizacao so para o administrador, com auditoria", async () => {
    const { cookie } = await masterWith2fa();
    const tenant = await app.inject({
      method: "POST",
      url: "/master/tenants",
      headers: { cookie },
      payload: {
        name: "Loja",
        slug: "loja-lgpd",
        adminEmail: "admin@loja-lgpd.local",
        adminPassword: "senha-admin-123",
      },
    });
    const organizationId = tenant.json().organization.id;
    const admin = cookieFrom(await login("admin@loja-lgpd.local", "senha-admin-123"));
    const base = `/organizations/${organizationId}`;
    const assistant = await app.inject({
      method: "POST",
      url: `${base}/assistants`,
      headers: { cookie: admin },
      payload: { name: "Assistente", modelId: "gpt-4o-mini" },
    });
    const key = await app.inject({
      method: "POST",
      url: `${base}/widget-keys`,
      headers: { cookie: admin },
      payload: {
        assistantId: assistant.json().id,
        environment: "producao",
        domains: ["loja.test"],
      },
    });
    const conversation = (
      await startWidgetConversation(app, key.json().plaintext, { visitorEmail: "titular@x.com" })
    ).json();
    await app.inject({
      method: "POST",
      url: `/widget/conversations/${conversation.conversationId}/messages`,
      headers: { origin: "https://loja.test" },
      payload: { key: key.json().plaintext, message: "Quero meus dados" },
    });

    const exported = await app.inject({
      method: "GET",
      url: `${base}/export`,
      headers: { cookie: admin },
    });
    expect(exported.headers["content-disposition"]).toContain("dados-loja-lgpd");
    const data = exported.json();
    expect(data.contacts[0]).toMatchObject({ email: "titular@x.com" });
    expect(data.conversations[0].messages[0]).toMatchObject({
      role: "visitante",
      content: "Quero meus dados",
    });
    expect(data.members[0]).toMatchObject({ email: "admin@loja-lgpd.local" });
    expect(exported.body).not.toContain("password_hash");

    const audit = await app.inject({
      method: "GET",
      url: `${base}/audit`,
      headers: { cookie: admin },
    });
    expect(
      audit
        .json()
        .map((e: { action: string }) => e.action)
        .join(),
    ).toContain("Exportou dados da organizacao");
  });
});
