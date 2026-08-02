/**
 * Seed local para testar o widget de ponta a ponta contra o backend real,
 * sem repetir curl a mao. So fala com a API publica (nenhum import de
 * modulo interno), entao passa pelas mesmas regras de negocio do painel e
 * fica de fora do lint de fronteira de modulo (ADR-002 — scripts/ nao e
 * varrido pelo dependency-cruiser porque nao faz parte de src/).
 *
 * Pre-requisitos: backend rodando (`npm run dev`) e um usuario Master ja
 * criado (`npx tsx scripts/create-master.ts <email> "<senha>"`).
 *
 * Uso (todos os parametros sao opcionais, com defaults de demo):
 *   npx tsx scripts/seed-demo.ts \
 *     --master-email admin@chatrag.local --master-password "uma-senha-forte" \
 *     [--slug demo-widget] [--org-name "Demo Widget"] \
 *     [--admin-email admin@demo-widget.com] [--admin-password demo12345] \
 *     [--assistant "Assistente Widget Demo"] [--model gpt-4o-mini] \
 *     [--domain localhost] [--api http://localhost:3333] [--no-html]
 *
 * Reaproveita organizacao/assistente/topico existentes com o mesmo
 * slug/nome (idempotente). A chave de widget e sempre nova a cada execucao
 * — o valor em texto puro so aparece uma vez, na criacao (nunca fica
 * recuperavel depois, nem pelo painel).
 *
 * Por padrao regrava widget/test/real-backend-test.html com a chave gerada,
 * para abrir a pagina ja mirando o assistente criado/reaproveitado.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

interface Args {
  [key: string]: string | boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const str = (key: string, fallback?: string) =>
  typeof args[key] === "string" ? (args[key] as string) : fallback;

const apiBase = str("api", "http://localhost:3333")!;
const slug = str("slug", "demo-widget")!;
const orgName = str("org-name", "Demo Widget")!;
const adminEmail = str("admin-email", `admin@${slug}.com`)!;
const adminPassword = str("admin-password", "demo12345")!;
const assistantName = str("assistant", "Assistente Widget Demo")!;
const modelId = str("model", "gpt-4o-mini")!;
const domain = str("domain", "localhost")!;
// Identidade/contexto do visitante gravados na pagina de teste do widget
// (docs/integrations/widget-embed.md). Vazio = atributo omitido no <script>.
const externalUserId = str("external-user-id", "");
const visitorName = str("visitor-name", "");
const visitorEmail = str("visitor-email", "");
const visitorContext = str("context", "");
const writeHtml = args["no-html"] !== true;
const masterEmail = str("master-email");
const masterPassword = str("master-password");

if (!masterEmail || !masterPassword) {
  console.error(
    "Uso: informe --master-email e --master-password de um usuario Master ja criado " +
      '(npx tsx scripts/create-master.ts <email> "<senha>").',
  );
  process.exit(1);
}

class Session {
  private cookie: string | null = null;

  constructor(private readonly base: string) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
    if (init.body) headers["Content-Type"] = "application/json";
    if (this.cookie) headers.Cookie = this.cookie;

    const res = await fetch(`${this.base}${path}`, { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await res.json().catch(() => null) : null;
    if (!res.ok) {
      throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
    }
    return body as T;
  }

  login(email: string, password: string) {
    return this.request<{ ok: true }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
}

interface Organization {
  id: string;
  slug: string;
  name: string;
}

interface Assistant {
  id: string;
  name: string;
}

interface Topic {
  id: string;
  name: string;
}

async function resolveOrganization(
  master: Session,
): Promise<{ organization: Organization; adminCreatedNow: boolean }> {
  try {
    const result = await master.request<{
      organization: Organization;
      adminUser: { id: string; email: string };
    }>("/master/tenants", {
      method: "POST",
      body: JSON.stringify({ name: orgName, slug, adminEmail, adminPassword }),
    });
    console.log(`Organizacao criada: ${result.organization.name} (${result.organization.id})`);
    return { organization: result.organization, adminCreatedNow: true };
  } catch (err) {
    const tenants = await master.request<Organization[]>("/master/tenants");
    const existing = tenants.find((t) => t.slug === slug);
    if (!existing) throw err;
    console.log(`Organizacao ja existia, reaproveitando: ${existing.name} (${existing.id})`);
    return { organization: existing, adminCreatedNow: false };
  }
}

async function resolveAssistant(tenant: Session, organizationId: string): Promise<Assistant> {
  const assistants = await tenant.request<Assistant[]>(
    `/organizations/${organizationId}/assistants`,
  );
  const existing = assistants.find((a) => a.name === assistantName);
  if (existing) {
    console.log(`Assistente ja existia, reaproveitando: ${existing.name} (${existing.id})`);
    return existing;
  }
  const created = await tenant.request<Assistant>(`/organizations/${organizationId}/assistants`, {
    method: "POST",
    body: JSON.stringify({ name: assistantName, modelId }),
  });
  console.log(`Assistente criado: ${created.name} (${created.id})`);
  return created;
}

async function resolveTopic(tenant: Session, organizationId: string): Promise<Topic> {
  const topics = await tenant.request<Topic[]>(`/organizations/${organizationId}/topics`);
  const existing = topics.find((t) => t.name === "Atendimento");
  if (existing) return existing;
  const created = await tenant.request<Topic>(`/organizations/${organizationId}/topics`, {
    method: "POST",
    body: JSON.stringify({ name: "Atendimento" }),
  });
  console.log(`Topico criado: ${created.name} (${created.id})`);
  return created;
}

/** Reescreve o `<script>` inteiro da pagina de teste: so trocar a chave
 * deixaria para tras atributos de uma execucao anterior (ex.: um
 * data-context antigo continuaria valendo em silencio). */
function buildScriptTag(key: string, assistant: string): string {
  const attrs = [
    `      src="../dist/chat-widget.js"`,
    `      data-key="${key}"`,
    `      data-mode="floating"`,
    `      data-title="${assistant}"`,
    `      data-greeting="Ola! Sou o assistente de teste. Pergunte algo."`,
  ];
  if (externalUserId) attrs.push(`      data-external-user-id="${externalUserId}"`);
  if (visitorName) attrs.push(`      data-visitor-name="${visitorName}"`);
  if (visitorEmail) attrs.push(`      data-visitor-email="${visitorEmail}"`);
  if (visitorContext) attrs.push(`      data-context='${visitorContext}'`);
  attrs.push(`      async`);
  return `    <script\n${attrs.join("\n")}\n    ></script>`;
}

async function writeTestHtml(key: string, assistant: string) {
  const path = fileURLToPath(new URL("../../widget/test/real-backend-test.html", import.meta.url));
  const html = await readFile(path, "utf8");
  const updated = html.replace(/ {4}<script\b[\s\S]*?<\/script>/, buildScriptTag(key, assistant));
  await writeFile(path, updated, "utf8");
  console.log(`\nwidget/test/real-backend-test.html atualizado com a nova chave.`);
  if (externalUserId || visitorName || visitorEmail || visitorContext) {
    console.log(
      `Identidade do visitante gravada: ${[
        externalUserId && `external-user-id=${externalUserId}`,
        visitorName && `nome=${visitorName}`,
        visitorEmail && `email=${visitorEmail}`,
        visitorContext && `context=${visitorContext}`,
      ]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }
  console.log("Para abrir: build o widget (npm run build em widget/) e sirva a raiz do repo, ex.:");
  console.log("  python -m http.server 4174");
  console.log("  http://localhost:4174/widget/test/real-backend-test.html");
}

async function main() {
  const master = new Session(apiBase);
  await master.login(masterEmail!, masterPassword!);

  const { organization, adminCreatedNow } = await resolveOrganization(master);

  await master.request(`/master/tenants/${organization.id}/allowed-models`, {
    method: "PUT",
    body: JSON.stringify({ modelIds: [modelId] }),
  });

  const tenant = new Session(apiBase);
  try {
    await tenant.login(adminEmail, adminPassword);
  } catch (err) {
    if (adminCreatedNow) throw err;
    throw new Error(
      `Nao consegui logar como ${adminEmail} numa organizacao ja existente. ` +
        `Informe --admin-email/--admin-password corretos para esse tenant. Detalhe: ${(err as Error).message}`,
    );
  }

  const assistant = await resolveAssistant(tenant, organization.id);
  await resolveTopic(tenant, organization.id);

  const key = await tenant.request<{ masked: string; plaintext: string; environment: string }>(
    `/organizations/${organization.id}/widget-keys`,
    {
      method: "POST",
      body: JSON.stringify({ assistantId: assistant.id, environment: "teste", domains: [domain] }),
    },
  );

  console.log("\n=== Resumo ===");
  console.log(`Organizacao: ${organization.name} (${organization.id}) — slug ${organization.slug}`);
  console.log(`Admin do tenant: ${adminEmail} / ${adminPassword}`);
  console.log(`Assistente: ${assistant.name} (${assistant.id})`);
  console.log(`Dominio liberado: ${domain}`);
  console.log(`Chave de widget (teste) — guarde agora, so aparece uma vez: ${key.plaintext}`);

  if (writeHtml) await writeTestHtml(key.plaintext, assistant.name);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
