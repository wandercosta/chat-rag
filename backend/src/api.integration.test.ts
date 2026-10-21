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

/** PDF minimo valido com uma frase, gerado na mao (sem dependencia extra). */
function tinyPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 40 760 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

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
    const pdf = tinyPdf("O prazo para desistir de compra feita pela internet e de sete dias.");
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="topicId"\r\n\r\n${topicId}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nPolitica de Trocas\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="trocas.pdf"\r\n` +
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
    expect(count).toBeGreaterThan(0);

    const answer = await app.inject({
      method: "POST",
      url: `/organizations/${organizationId}/assistants/${assistant.json().id}/playground-messages`,
      headers,
      payload: { message: "Qual o prazo para desistir de uma compra feita pela internet?" },
    });
    expect(answer.statusCode).toBe(200);
    const result = answer.json();
    expect(result.usedContext).toBe(true);
    expect(result.answer).toContain("sete dias");
    expect(result.citations[0]).toMatchObject({ index: 1, sourceTitle: "Politica de Trocas" });
    expect(result.citations[0].excerpt).toContain("sete dias");
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
