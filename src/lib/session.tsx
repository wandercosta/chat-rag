import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, organizationsApi, type AuthContext as ApiAuthContext } from "./api-client";

export type Scope = "master" | "tenant";
export type TenantRole = "Administrador" | "Editor de base" | "Analista";
export type Profile = "Master" | TenantRole;
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface SupportSession {
  tenantId: string;
  justification: string;
  expiresAt: number;
}

interface SessionValue {
  status: AuthStatus;
  scope: Scope | null;
  profile: Profile | null;
  userEmail: string | null;
  tenantId: string | null;
  tenantName: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Estado da chave de IA do tenant — ainda nao ligado a API real nesta
   * fase (ver docs/README.md). Telas que precisam disso de verdade devem
   * consultar GET /organizations/:id/ai-credentials diretamente. */
  aiKeyReady: boolean;
  setAiKeyReady: (v: boolean) => void;
  /** Sessao de suporte do Master — o backend real existe e funciona
   * (backend/src/modules/organizations/support-sessions.routes.ts), mas
   * ainda nao foi ligado nesta tela; fica inerte de proposito. */
  support: SupportSession | null;
  startSupport: (tenantId: string, justification: string, minutes: number) => void;
  endSupport: () => void;
  supportRemaining: string;
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
    "write",
  ],
  "Editor de base": ["assistants", "knowledge", "write"],
  Analista: ["conversations", "gaps"],
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
  const [aiKeyReady, setAiKeyReady] = useState(false);
  const [support, setSupport] = useState<SupportSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (support && support.expiresAt <= now) setSupport(null);
  }, [support, now]);

  const value = useMemo<SessionValue>(() => {
    const profile = auth ? deriveProfile(auth) : null;
    const scope: Scope | null = auth ? (auth.isPlatform ? "master" : "tenant") : null;
    const remainingMs = support ? Math.max(0, support.expiresAt - now) : 0;
    const mm = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
    const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0");

    return {
      status,
      scope,
      profile,
      userEmail: auth?.email ?? null,
      tenantId: auth?.memberships[0]?.organizationId ?? null,
      tenantName,
      login: async (email, password) => {
        await authApi.login(email, password);
        await refresh();
      },
      logout: async () => {
        await authApi.logout();
        setAuth(null);
        setStatus("unauthenticated");
      },
      aiKeyReady,
      setAiKeyReady,
      support,
      startSupport: (tenantId, justification, minutes) =>
        setSupport({ tenantId, justification, expiresAt: Date.now() + minutes * 60000 }),
      endSupport: () => setSupport(null),
      supportRemaining: `${mm}:${ss}`,
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      can: (perm) => (profile ? matrix[profile].includes(perm) : false),
    };
  }, [status, auth, tenantName, aiKeyReady, support, now, theme]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession precisa estar dentro de SessionProvider");
  return ctx;
}
