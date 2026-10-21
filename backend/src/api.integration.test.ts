import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Armazenamento de arquivos em memoria: o teste cobre a API e o pipeline de
// RAG, nao o storage S3.
const files = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("./storage/objects.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage/objects.js")>()),
  putSourceFile: async (key: string, body: Buffer) => void files.set(key, body),
  getSourceFile: async (key: string) => files.get(key)!,
}));

const { buildApp } = await import("./app.js");
const { db } = await import("./db/client.js");
const { identityService } = await import("./modules/identity/index.js");
const { extractionService, sourcesService } = await import("./modules/knowledge/index.js");
const { indexingService } = await import("./modules/rag/index.js");
const { RUN_INTEGRATION_TESTS, resetDatabase } = await import("./test/integration-helpers.js");

/** O mesmo PDF publico usado pelo seed (Codigo de Defesa do Consumidor). */
const CDC_PDF = readFileSync(new URL("../seed/codigo-defesa-consumidor.pdf", import.meta.url));

function cookieFrom(response: { cookies: Array<{ name: string; value: string }> }) {
  return response.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Fluxo principal da API de ponta a ponta: autenticacao, upload de PDF,
 * indexacao e pergunta com citacao do documento de origem. Roda com IA em
 * modo local (AI_PROVIDER=local, EMBEDDING_PROVIDER=hash — vitest.config.ts):
 * sem chave e sem rede.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)("API: auth, upload e pergunta", () => {
  let app: FastifyInstance;
  let tenantCookie: string;
  let organizationId: string;

  beforeEach(async () => {
    files.clear();
    await resetDatabase();
    app = await buildApp({ logger: false });

    const master = await identityService.createUser(db, "master@teste.local", "senha-master-123");
    await db.insertInto("platform_roles").values({ user_id: master.id }).execute();
    const masterLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "master@teste.local", password: "senha-master-123" },
    });

    const tenant = await app.inject({
      method: "POST",
      url: "/master/tenants",
      headers: { cookie: cookieFrom(masterLogin) },
      payload: {
        name: "Loja Teste",
        slug: "loja-teste",
        adminEmail: "admin@loja-teste.local",
        adminPassword: "senha-admin-123",
      },
    });
    organizationId = tenant.json().organization.id;

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@loja-teste.local", password: "senha-admin-123" },
    });
    tenantCookie = cookieFrom(login);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("rejects a wrong password and protected routes without a session", async () => {
    const wrong = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@loja-teste.local", password: "senha-errada" },
    });
    expect(wrong.statusCode).toBe(401);

    const anonymous = await app.inject({
      method: "GET",
      url: `/organizations/${organizationId}/assistants`,
    });
    expect(anonymous.statusCode).toBe(401);

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: tenantCookie } });
    expect(me.statusCode).toBe(200);
  });

  it("uploads a PDF, indexes it and answers citing the source document", async () => {
    const headers = { cookie: tenantCookie };

    const assistant = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/assistants`,
      headers,
      payload: { name: "Assistente Teste", modelId: "gpt-4o-mini" },
    });
    expect(assistant.statusCode).toBe(201);

    const topic = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/topics`,
      headers,
      payload: { name: "Trocas" },
    });
    const topicId = topic.json().id;

    const boundary = "----chatragtest";
    const pdf = CDC_PDF;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="topicId"\r\n\r\n${topicId}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nCodigo de Defesa do Consumidor\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cdc.pdf"\r\n` +
          `Content-Type: application/pdf\r\n\r\n`,
      ),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const upload = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/sources/upload`,
      headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(upload.statusCode).toBe(201);
    const source = upload.json();
    // IA da plataforma disponivel (.env): a fonte vai direto para a fila.
    expect(source.status).toBe("fila");

    // Mesmo trabalho que o worker faz ao consumir a fila (src/worker.ts).
    const { chunks } = await extractionService.extractAndChunk(organizationId, source.id);
    const count = await indexingService.embedAndStoreChunks(organizationId, source.id, topicId, chunks);
    await sourcesService.markReady(organizationId, source.id, count);
    // A lei inteira (~130 artigos) vira dezenas de trechos.
    expect(count).toBeGreaterThan(50);

    // Os testes usam embeddings por hashing (sem rede): o que se verifica aqui
    // e o pipeline, nao a qualidade da busca — essa foi calibrada com o modelo
    // real (local-embeddings.ts) e tem testes unitarios proprios.
    const answer = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/assistants/${assistant.json().id}/playground-messages`,
      headers,
      payload: { message: "Em quantos dias o consumidor pode desistir do contrato?" },
    });
    expect(answer.statusCode).toBe(200);
    const result = answer.json();
    expect(result.usedContext).toBe(true);
    expect(result.answer).toContain("[1]");
    expect(result.citations[0]).toMatchObject({
      index: 1,
      sourceId: source.id,
      sourceTitle: "Codigo de Defesa do Consumidor",
    });
    expect(result.citations[0].excerpt.length).toBeGreaterThan(20);

    // A citacao fica gravada na mensagem e aparece na transcricao do painel.
    const transcript = await app.inject({
      method: "GET",
      url: `/organizations/${organizationId}/conversations/${result.conversationId}`,
      headers,
    });
    const saved = transcript.json().messages.at(-1);
    expect(saved.citations).toEqual(result.citations);
  });

  it("does not answer from outside the knowledge base", async () => {
    const assistant = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/assistants`,
      headers: { cookie: tenantCookie },
      payload: { name: "Assistente Vazio", modelId: "gpt-4o-mini" },
    });

    const answer = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/assistants/${assistant.json().id}/playground-messages`,
      headers: { cookie: tenantCookie },
      payload: { message: "Qual a capital da Franca?" },
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toMatchObject({ usedContext: false, citations: [] });
  });
});
