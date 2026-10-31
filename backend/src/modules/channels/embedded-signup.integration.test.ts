import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { realtime } from "../../realtime/events.js";
import { channelMessagesQueue } from "../../queue/channel-messages.queue.js";
import { RUN_INTEGRATION_TESTS, resetDatabase } from "../../test/integration-helpers.js";
import { startFakeGraphApi } from "../../test/fake-graph-api.js";
import { createMaster, createTenant } from "../../test/tenant-fixture.js";
import { processChannelJob } from "./index.js";

// Mesmos valores do vitest.config.ts (app da plataforma simulado).
const PLATFORM_SECRET = "segredo-do-app-da-plataforma";
const PLATFORM_VERIFY = "verificacao-da-plataforma";
const PHONE_ID = "777888999";

const sign = (body: string, secret = PLATFORM_SECRET) =>
  `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

/**
 * Cadastro integrado da Meta (Embedded Signup) e estado dos canais na tela do
 * Master: o code vira o token da conta, o app da plataforma assina os
 * webhooks da conta e as mensagens chegam pelo webhook unico, roteadas pelo
 * numero. O Master ve o estado sem segredo nenhum.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("cadastro integrado e canais no Master", () => {
  let app: FastifyInstance;
  let masterCookie: string;
  let fake: Awaited<ReturnType<typeof startFakeGraphApi>>;

  async function drainJobs() {
    const jobs = await channelMessagesQueue.getJobs(["waiting", "delayed", "prioritized"]);
    for (const job of jobs) {
      await processChannelJob(job.data);
      await job.remove();
    }
  }

  beforeAll(async () => {
    fake = await startFakeGraphApi();
  });

  beforeEach(async () => {
    fake.sent.length = 0;
    fake.subscribedApps.length = 0;
    await channelMessagesQueue.obliterate({ force: true });
    await resetDatabase();
    app = await buildApp({ logger: false });
    masterCookie = await createMaster(app);
  });

  afterAll(async () => {
    await fake.close();
    await channelMessagesQueue.close();
    await realtime.close();
    await redis.quit();
    await db.destroy();
  });

  it("conecta pelo cadastro integrado e recebe pelo webhook unico", async () => {
    const t = await createTenant(app, masterCookie, "es-a");
    const headers = { cookie: t.admin };
    const config = await app.inject({
      method: "GET",
      url: `${t.base}/channels/embedded-signup`,
      headers,
    });
    expect(config.json().config).toEqual({
      appId: "100200300",
      configId: "cfg-cadastro-integrado",
    });
    expect(config.body).not.toContain(PLATFORM_SECRET);

    const connect = (code: string) =>
      app.inject({
        method: "POST",
        url: `${t.base}/channels/whatsapp/embedded`,
        headers,
        payload: {
          name: "WhatsApp da loja",
          assistantId: t.assistantId,
          code,
          phoneNumberId: PHONE_ID,
          wabaId: "555444333",
        },
      });
    const refused = await connect("code-errado");
    expect(refused.statusCode).toBe(422);
    expect(refused.body).not.toContain(PLATFORM_SECRET);

    const created = await connect("code-valido");
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: "ativo", config: { signup: "embedded" } });
    expect(created.body).not.toContain("EAAtokendocadastrointegrado");
    expect(fake.subscribedApps).toEqual(["555444333"]);

    // Verificacao do webhook unico do app da plataforma.
    const verify = (token: string) =>
      app.inject({
        method: "GET",
        url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=42`,
      });
    expect((await verify("errado")).statusCode).toBe(403);
    expect((await verify(PLATFORM_VERIFY)).body).toBe("42");

    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_ID },
                contacts: [{ wa_id: "5511977776666", profile: { name: "Rui" } }],
                messages: [
                  {
                    id: "wamid.es.1",
                    from: "5511977776666",
                    type: "text",
                    text: { body: "Quero falar com um atendente" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const post = (signature: string) =>
      app.inject({
        method: "POST",
        url: "/webhooks/whatsapp",
        headers: { "content-type": "application/json", "x-hub-signature-256": signature },
        payload: body,
      });
    expect((await post(sign(body, "outro-segredo"))).statusCode).toBe(401);
    expect((await post(sign(body))).statusCode).toBe(200);
    await drainJobs();
    expect(fake.sent.at(-1)?.body).toMatchObject({ to: "5511977776666" });
    expect(fake.sent.at(-1)?.body.text?.body).toContain("Um atendente vai continuar");

    // Estado dos canais na tela do Master: so com sessao de suporte, sem
    // token, segredo nem verificacao.
    const masterUrl = `/master/tenants/${t.organizationId}/channels`;
    expect(
      (await app.inject({ method: "GET", url: masterUrl, headers: { cookie: masterCookie } }))
        .statusCode,
    ).toBe(403);
    await app.inject({
      method: "POST",
      url: `/master/tenants/${t.organizationId}/support-sessions`,
      headers: { cookie: masterCookie },
      payload: { justification: "Cliente relatou WhatsApp sem resposta", minutes: 30 },
    });
    const master = await app.inject({
      method: "GET",
      url: `/master/tenants/${t.organizationId}/channels`,
      headers: { cookie: masterCookie },
    });
    expect(master.statusCode).toBe(200);
    expect(master.json()).toEqual([
      expect.objectContaining({ provider: "whatsapp", status: "ativo", name: "WhatsApp da loja" }),
    ]);
    expect(master.json()[0]).not.toHaveProperty("secret");
    expect(master.json()[0]).not.toHaveProperty("verify_token");
    expect(master.json()[0]).not.toHaveProperty("secret_hint");
    const asTenant = await app.inject({
      method: "GET",
      url: `/master/tenants/${t.organizationId}/channels`,
      headers,
    });
    expect(asTenant.statusCode).toBe(403);
  });
});
