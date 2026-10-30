import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { identityService } from "../modules/identity/index.js";

/** Origem permitida da chave de widget criada pela fixture. */
export const WIDGET_ORIGIN = "https://loja.test";

export function cookieFrom(response: { cookies: Array<{ name: string; value: string }> }) {
  return response.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

export async function login(app: FastifyInstance, email: string, password: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return cookieFrom(res);
}

/** Master da plataforma; chamar depois de resetDatabase(). */
export async function createMaster(app: FastifyInstance) {
  const master = await identityService.createUser(db, "master@teste.local", "senha-master-123");
  await db.insertInto("platform_roles").values({ user_id: master.id }).execute();
  return login(app, "master@teste.local", "senha-master-123");
}

export type TenantRolePerson = { cookie: string; userId: string };

/**
 * Tenant pronto para teste: administrador logado, um assistente (com a caixa
 * de entrada ligada), chave de widget para `loja.test` e uma pessoa logada
 * para cada papel que nao e administrador.
 */
export async function createTenant(app: FastifyInstance, masterCookie: string, slug: string) {
  const tenant = await app.inject({
    method: "POST",
    url: "/master/tenants",
    headers: { cookie: masterCookie },
    payload: {
      name: `Loja ${slug}`,
      slug,
      adminEmail: `admin@${slug}.local`,
      adminPassword: "senha-admin-123",
    },
  });
  const organizationId: string = tenant.json().organization.id;
  const admin = await login(app, `admin@${slug}.local`, "senha-admin-123");

  const base = `/organizations/${organizationId}`;
  const assistant = await app.inject({
    method: "POST",
    url: `${base}/assistants`,
    headers: { cookie: admin },
    payload: { name: "Assistente", modelId: "gpt-4o-mini" },
  });
  const assistantId: string = assistant.json().id;
  await app.inject({
    method: "PATCH",
    url: `${base}/assistants/${assistantId}`,
    headers: { cookie: admin },
    payload: { humanInboxEnabled: true },
  });

  const key = await app.inject({
    method: "POST",
    url: `${base}/widget-keys`,
    headers: { cookie: admin },
    payload: { assistantId, environment: "producao", domains: ["loja.test"] },
  });

  const people = {} as Record<"Atendente" | "Analista" | "Editor de base", TenantRolePerson>;
  for (const role of ["Atendente", "Analista", "Editor de base"] as const) {
    const email = `${role.split(" ")[0].toLowerCase()}@${slug}.local`;
    const member = await app.inject({
      method: "POST",
      url: `${base}/members`,
      headers: { cookie: admin },
      payload: { email, password: "senha-membro-123", role },
    });
    people[role] = {
      cookie: await login(app, email, "senha-membro-123"),
      userId: member.json().user_id,
    };
  }

  return {
    organizationId,
    assistantId,
    base,
    admin,
    key: key.json().plaintext as string,
    people,
  };
}

/** Conversa aberta pelo widget, como o script faz no site do cliente. */
export function startWidgetConversation(
  app: FastifyInstance,
  key: string,
  visitor: { externalUserId?: string; visitorName?: string; visitorEmail?: string } = {},
) {
  return app.inject({
    method: "POST",
    url: "/widget/conversations",
    headers: { origin: WIDGET_ORIGIN },
    payload: { key, ...visitor },
  });
}
