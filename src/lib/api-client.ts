/**
 * Cliente do backend real (ver backend/README.md e docs/apis/contratos-planejados.md).
 * So cobre o que ja esta ligado no painel — mais rotas existem no backend e
 * podem ser adicionadas aqui seguindo o mesmo padrao conforme mais telas
 * saem do mock.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  // So manda Content-Type quando ha corpo: Fastify rejeita (400) uma
  // requisicao com esse header e corpo vazio (ex.: POST /auth/logout).
  const headers = init.body
    ? { "Content-Type": "application/json", ...init.headers }
    : init.headers;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? body?.message ?? `erro HTTP ${response.status}`,
    );
  }
  return body as T;
}

const get = <T>(path: string) => apiFetch<T>(path);
const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

// --- auth -------------------------------------------------------------

export interface AuthContext {
  userId: string;
  email: string;
  isPlatform: boolean;
  memberships: { organizationId: string; role: "Administrador" | "Editor de base" | "Analista" }[];
}

export const authApi = {
  login: (email: string, password: string) =>
    post<{ ok: true }>("/auth/login", { email, password }),
  logout: () => post<{ ok: true }>("/auth/logout"),
  me: () => get<{ auth: AuthContext }>("/auth/me"),
};

// --- organizations ------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: "ativo" | "suspenso";
  retention_days: number | null;
  created_at: string;
}

export const organizationsApi = {
  getMine: (organizationId: string) => get<Organization>(`/organizations/${organizationId}`),
};

// --- master: tenants ------------------------------------------------------

export interface CreateTenantInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
}

export const masterApi = {
  listTenants: () => get<Organization[]>("/master/tenants"),
  createTenant: (input: CreateTenantInput) =>
    apiFetch<{ organization: Organization; adminUser: { id: string; email: string } }>(
      "/master/tenants",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
};

// --- assistants ------------------------------------------------------

export interface Assistant {
  id: string;
  organization_id: string;
  name: string;
  status: "publicado" | "rascunho" | "pausado";
  model_id: string;
  response_mode: "estrita";
  instructions: string | null;
  retention_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAssistantInput {
  name: string;
  modelId: string;
  instructions?: string | null;
}

export const assistantsApi = {
  list: (organizationId: string) => get<Assistant[]>(`/organizations/${organizationId}/assistants`),
  create: (organizationId: string, input: CreateAssistantInput) =>
    post<Assistant>(`/organizations/${organizationId}/assistants`, input),
};

export interface AllowedModel {
  id: string;
  label: string;
  note: string | null;
}

export const modelsApi = {
  listAllowed: (organizationId: string) =>
    get<AllowedModel[]>(`/organizations/${organizationId}/allowed-models`),
};
