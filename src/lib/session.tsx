import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TenantRole } from "./mock-data";
import { tenants } from "./mock-data";

/**
 * Estado de "sessão atual" APENAS para navegar o protótipo.
 * TODO(API): no produto final o escopo (master/tenant), o tenant ativo e o perfil
 * vêm exclusivamente do login/servidor. Nada aqui autoriza acesso — é só visibilidade visual.
 */

export type Scope = "master" | "tenant";
export type Profile = "Master" | TenantRole;

interface SupportSession {
  tenantId: string;
  justification: string;
  expiresAt: number;
}

interface SessionValue {
  scope: Scope;
  profile: Profile;
  tenantId: string;
  tenantName: string;
  setProfile: (p: Profile) => void;
  setTenantId: (id: string) => void;
  /** Estado simulado da chave de IA do tenant. Define disponibilidade de indexação/playground/widget. */
  aiKeyReady: boolean;
  setAiKeyReady: (v: boolean) => void;
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

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>("Administrador");
  const [tenantId, setTenantId] = useState<string>(tenants[0].id);
  const [aiKeyReady, setAiKeyReady] = useState(false);
  const [support, setSupport] = useState<SupportSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [theme, setTheme] = useState<"light" | "dark">("light");

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
    const scope: Scope = profile === "Master" ? "master" : "tenant";
    const remainingMs = support ? Math.max(0, support.expiresAt - now) : 0;
    const mm = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
    const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0");
    return {
      scope,
      profile,
      tenantId,
      tenantName: tenants.find((t) => t.id === tenantId)?.name ?? "—",
      setProfile,
      setTenantId,
      aiKeyReady,
      setAiKeyReady,
      support,
      startSupport: (tid, justification, minutes) =>
        setSupport({ tenantId: tid, justification, expiresAt: Date.now() + minutes * 60000 }),
      endSupport: () => setSupport(null),
      supportRemaining: `${mm}:${ss}`,
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      can: (perm) => matrix[profile].includes(perm),
    };
  }, [profile, tenantId, aiKeyReady, support, now, theme]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession precisa estar dentro de SessionProvider");
  return ctx;
}
