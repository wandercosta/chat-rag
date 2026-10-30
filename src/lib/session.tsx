import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, organizationsApi, type AuthContext as ApiAuthContext } from "./api-client";

export type Scope = "master" | "tenant";
export type TenantRole = "Administrador" | "Editor de base" | "Analista" | "Atendente";
export type Profile = "Master" | TenantRole;
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionValue {
  status: AuthStatus;
  scope: Scope | null;
  profile: Profile | null;
  userEmail: string | null;
  userId: string | null;
  tenantId: string | null;
  tenantName: string;
  login: (email: string, password: string, code?: string) => Promise<void>;
  twoFactorEnabled: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  theme: "light" | "dark";
  toggleTheme: () => void;
  can: (perm: Permission) => boolean;
}

export type Permission =
  | "platform"
  | "assistants"
  | "knowledge"
  | "conversations"
  | "gaps"
  | "integrations"
  | "users"
  | "settings"
  | "audit"
  | "inbox"
  | "inbox_reply"
  | "contacts"
  | "contacts_write"
  | "channels"
  | "campaigns"
  | "automations"
  | "metrics"
  | "write";

const matrix: Record<Profile, Permission[]> = {
  Master: [
    "platform",
    "assistants",
    "knowledge",
    "conversations",
    "gaps",
    "integrations",
    "users",
    "settings",
    "audit",
    "inbox",
    "contacts",
    "channels",
    "campaigns",
    "automations",
    "metrics",
    "write",
  ],
  Administrador: [
    "assistants",
    "knowledge",
    "conversations",
    "gaps",
    "integrations",
    "users",
    "settings",
    "audit",
    "inbox",
    "inbox_reply",
    "contacts",
    "contacts_write",
    "channels",
    "campaigns",
    "automations",
    "metrics",
    "write",
  ],
  "Editor de base": ["assistants", "knowledge", "write"],
  Analista: ["conversations", "gaps", "inbox", "contacts", "campaigns", "automations", "metrics"],
  // Responde e resolve conversas; nao mexe em base, chaves nem usuarios.
  Atendente: ["inbox", "inbox_reply", "contacts", "contacts_write"],
};

function deriveProfile(auth: ApiAuthContext): Profile {
  if (auth.isPlatform) return "Master";
  return auth.memberships[0]?.role ?? "Analista";
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [auth, setAuth] = useState<ApiAuthContext | null>(null);
  const [tenantName, setTenantName] = useState("—");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  async function refresh() {
    try {
      const { auth: current } = await authApi.me();
      setAuth(current);
      setStatus("authenticated");
    } catch {
      setAuth(null);
      setStatus("unauthenticated");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const orgId = auth?.memberships[0]?.organizationId;
    if (!orgId) {
      setTenantName("—");
      return;
    }
    organizationsApi
      .getMine(orgId)
      .then((org) => setTenantName(org.name))
      .catch(() => setTenantName("—"));
  }, [auth]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo<SessionValue>(() => {
    const profile = auth ? deriveProfile(auth) : null;
    const scope: Scope | null = auth ? (auth.isPlatform ? "master" : "tenant") : null;

    return {
      status,
      scope,
      profile,
      userEmail: auth?.email ?? null,
      userId: auth?.userId ?? null,
      tenantId: auth?.memberships[0]?.organizationId ?? null,
      tenantName,
      login: async (email, password, code) => {
        await authApi.login(email, password, code);
        await refresh();
      },
      twoFactorEnabled: auth?.twoFactorEnabled ?? false,
      refresh,
      logout: async () => {
        await authApi.logout();
        setAuth(null);
        setStatus("unauthenticated");
      },
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      can: (perm) => (profile ? matrix[profile].includes(perm) : false),
    };
  }, [status, auth, tenantName, theme]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession precisa estar dentro de SessionProvider");
  return ctx;
}
