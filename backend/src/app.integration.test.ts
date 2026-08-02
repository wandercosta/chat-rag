import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { db } from "./db/client.js";
import { identityService } from "./modules/identity/index.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "./test/integration-helpers.js";

/**
 * Regressao: request.auth so era preenchido para as rotas registradas dentro
 * do proprio modulo identity. Toda rota de qualquer outro modulo (aqui,
 * organizations) falhava sempre com 401 "sem sessao ativa", porque o hook
 * onRequest ficava preso ao contexto encapsulado do plugin (ver
 * modules/identity/plugin.ts). Nenhum teste que chama os guards diretamente
 * pega esse bug — so um teste HTTP real, atravessando modulos, pega.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("buildApp (HTTP integration)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("propagates the session across module boundaries", async () => {
    const master = await identityService.createUser(
      db,
      "app-master@chatrag.local",
      "senha-forte-123",
    );
    await db.insertInto("platform_roles").values({ user_id: master.id }).execute();

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "app-master@chatrag.local", password: "senha-forte-123" },
    });
    expect(loginResponse.statusCode).toBe(200);

    const cookieHeader = loginResponse.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    expect(cookieHeader).toContain("chatrag_session=");

    // Rota de um modulo diferente do identity — e exatamente aqui que o bug
    // de encapsulamento derrubava toda requisicao com 401.
    const tenantsResponse = await app.inject({
      method: "GET",
      url: "/master/tenants",
      headers: { cookie: cookieHeader },
    });

    expect(tenantsResponse.statusCode).toBe(200);
    expect(tenantsResponse.json()).toEqual([]);
  });

  it("still rejects requests with no session at all", async () => {
    const response = await app.inject({ method: "GET", url: "/master/tenants" });
    expect(response.statusCode).toBe(401);
  });
});
