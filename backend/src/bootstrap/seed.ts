/**
 * Seed de demonstracao executado pelo `docker compose up` (servico `seed`).
 * Deixa o produto pronto para testar de ponta a ponta:
 *
 *   1. tenant "Demo Consumidor" com um administrador
 *   2. assistente "Assistente do Consumidor" com aparencia de widget
 *   3. topico + upload do PDF do Codigo de Defesa do Consumidor (seed/)
 *   4. espera a indexacao (extracao -> chunks -> embeddings) terminar
 *   5. chave de widget conhecida (DEMO_WIDGET_KEY) liberada para localhost,
 *      usada pela pagina GET /demo
 *
 * Tudo, exceto a chave do item 5, passa pela API HTTP — as mesmas regras de
 * negocio do painel. Idempotente: rodar de novo reaproveita o que ja existe.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { db } from "../db/client.js";
import { keysService } from "../modules/embed/index.js";

const API = process.env.SEED_API_URL ?? "http://localhost:3333";
const MASTER_EMAIL = required("MASTER_EMAIL");
const MASTER_PASSWORD = required("MASTER_PASSWORD");
const ADMIN_EMAIL = required("DEMO_ADMIN_EMAIL");
const ADMIN_PASSWORD = required("DEMO_ADMIN_PASSWORD");
const DEMO_KEY = process.env.DEMO_WIDGET_KEY;

const ORG = { name: "Demo Consumidor", slug: "demo-consumidor" };
const ASSISTANT_NAME = "Assistente do Consumidor";
const TOPIC_NAME = "Código de Defesa do Consumidor";
const SOURCE_TITLE = "Código de Defesa do Consumidor (Lei 8.078/1990)";
const PDF_PATH = fileURLToPath(new URL("../../seed/codigo-defesa-consumidor.pdf", import.meta.url));
const INDEXING_TIMEOUT_MS = 15 * 60 * 1000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`variavel ${name} nao definida (ver .env.example)`);
  return value;
}

class Session {
  private cookie: string | null = null;

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
    if (typeof init.body === "string") headers["Content-Type"] = "application/json";
    if (this.cookie) headers.Cookie = this.cookie;

    const res = await fetch(`${API}${path}`, { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];

    const body = res.headers.get("content-type")?.includes("application/json")
      ? await res.json().catch(() => null)
      : null;
    if (!res.ok) {
      throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
    }
    return body as T;
  }

  login(email: string, password: string) {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
}

interface Named {
  id: string;
  name: string;
}
interface Source {
  id: string;
  title: string;
  status: string;
  error_message?: string | null;
}

async function ensureOrganization(master: Session): Promise<string> {
  const tenants = await master.request<Array<{ id: string; slug: string }>>("/master/tenants");
  const existing = tenants.find((t) => t.slug === ORG.slug);
  if (existing) return existing.id;

  const created = await master.request<{ organization: { id: string } }>("/master/tenants", {
    method: "POST",
    body: JSON.stringify({ ...ORG, adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD }),
  });
  console.log(`  organizacao criada: ${ORG.name}`);
  return created.organization.id;
}

async function ensureAssistant(tenant: Session, orgId: string): Promise<string> {
  const assistants = await tenant.request<Named[]>(`/organizations/${orgId}/assistants`);
  const existing = assistants.find((a) => a.name === ASSISTANT_NAME);
  const id =
    existing?.id ??
    (
      await tenant.request<Named>(`/organizations/${orgId}/assistants`, {
        method: "POST",
        body: JSON.stringify({
          name: ASSISTANT_NAME,
          modelId: "gpt-4o-mini",
          instructions:
            "Responda em portugues, de forma clara e curta, para um consumidor leigo. " +
            "Cite o artigo da lei quando ele aparecer no trecho usado.",
        }),
      })
    ).id;

  await tenant.request(`/organizations/${orgId}/assistants/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "publicado",
      widgetSettings: {
        title: "Direitos do Consumidor",
        greeting: "Olá! Tire suas dúvidas sobre o Código de Defesa do Consumidor.",
        accentColor: "#0F766E",
        position: "bottom-right",
        theme: "light",
      },
    }),
  });
  if (!existing) console.log(`  assistente criado: ${ASSISTANT_NAME}`);
  return id;
}

async function ensureTopic(tenant: Session, orgId: string): Promise<string> {
  const topics = await tenant.request<Named[]>(`/organizations/${orgId}/topics`);
  const existing = topics.find((t) => t.name === TOPIC_NAME);
  if (existing) return existing.id;
  const created = await tenant.request<Named>(`/organizations/${orgId}/topics`, {
    method: "POST",
    body: JSON.stringify({ name: TOPIC_NAME }),
  });
  return created.id;
}

async function ensureSource(tenant: Session, orgId: string, topicId: string): Promise<Source> {
  const sources = await tenant.request<Source[]>(
    `/organizations/${orgId}/topics/${topicId}/sources`,
  );
  const existing = sources.find((s) => s.title === SOURCE_TITLE);
  if (existing) return existing;

  const form = new FormData();
  form.append("topicId", topicId);
  form.append("title", SOURCE_TITLE);
  form.append(
    "file",
    new Blob([await readFile(PDF_PATH)], { type: "application/pdf" }),
    "codigo-defesa-consumidor.pdf",
  );
  const created = await tenant.request<Source>(`/organizations/${orgId}/sources/upload`, {
    method: "POST",
    body: form,
  });
  console.log(`  PDF enviado: ${SOURCE_TITLE} (status: ${created.status})`);

  if (created.status === "aguardando_revisao") {
    return tenant.request<Source>(`/organizations/${orgId}/sources/${created.id}/approve`, {
      method: "POST",
    });
  }
  return created;
}

async function waitForIndexing(tenant: Session, orgId: string, topicId: string, sourceId: string) {
  const started = Date.now();
  let lastStatus = "";
  while (Date.now() - started < INDEXING_TIMEOUT_MS) {
    const sources = await tenant.request<Source[]>(
      `/organizations/${orgId}/topics/${topicId}/sources`,
    );
    const source = sources.find((s) => s.id === sourceId);
    if (!source) throw new Error("fonte sumiu durante a indexacao");
    if (source.status !== lastStatus) {
      console.log(`  indexacao: ${source.status}`);
      lastStatus = source.status;
    }
    if (source.status === "pronta") return;
    if (source.status === "erro") throw new Error(`indexacao falhou: ${source.error_message ?? ""}`);
    if (source.status === "aguardando_ativacao") {
      throw new Error("fonte aguardando ativacao: configure AI_PROVIDER/EMBEDDING_PROVIDER no .env");
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("indexacao nao terminou dentro do tempo limite");
}

async function main() {
  console.log("▶ Seed de demonstracao");
  const master = new Session();
  await master.login(MASTER_EMAIL, MASTER_PASSWORD);
  const orgId = await ensureOrganization(master);

  const tenant = new Session();
  await tenant.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const assistantId = await ensureAssistant(tenant, orgId);
  const topicId = await ensureTopic(tenant, orgId);
  const source = await ensureSource(tenant, orgId, topicId);
  await waitForIndexing(tenant, orgId, topicId, source.id);

  if (DEMO_KEY) {
    const key = await keysService.ensureDemoKey(orgId, assistantId, DEMO_KEY, ["localhost"]);
    if (key.created) console.log("  chave de widget de demonstracao criada (localhost)");
  }

  console.log("✓ Seed concluido");
  console.log(`  painel: login ${ADMIN_EMAIL}`);
  if (DEMO_KEY) console.log("  widget: abra /demo na API");
}

main()
  .catch((err) => {
    console.error(`✗ Seed falhou: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
    // Os modulos importados abrem conexoes com o Redis (filas, rate limit) que
    // manteriam o processo vivo; o container do seed precisa terminar.
    process.exit();
  });
