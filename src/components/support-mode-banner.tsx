import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { masterApi, type Organization, type SupportSession } from "@/lib/api-client";
import { useSession } from "@/lib/session";

function isActive(s: SupportSession) {
  return !s.ended_at && new Date(s.expires_at).getTime() > Date.now();
}

/**
 * Aviso permanente de acesso de suporte ativo. Varre as organizacoes e
 * pergunta ao backend quais tem sessao aberta — o estado nao vive no
 * frontend, entao recarregar a pagina nao "esconde" um acesso em curso.
 */
export function SupportModeBanner() {
  const { scope } = useSession();

  const tenantsQuery = useQuery({
    queryKey: ["master-tenants"],
    queryFn: () => masterApi.listTenants(),
    enabled: scope === "master",
  });

  const tenants = tenantsQuery.data ?? [];

  const sessionsQuery = useQuery({
    queryKey: ["all-support-sessions", tenants.map((t) => t.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        tenants.map(async (t: Organization) => ({
          tenant: t,
          sessions: await masterApi.listSupportSessions(t.id),
        })),
      );
      return results
        .map((r) => ({ tenant: r.tenant, session: r.sessions.find(isActive) }))
        .filter((r): r is { tenant: Organization; session: SupportSession } => !!r.session);
    },
    enabled: scope === "master" && tenants.length > 0,
    // Uma sessao expira sozinha; sem revalidar, o aviso ficaria preso na tela.
    refetchInterval: 30_000,
  });

  const active = sessionsQuery.data?.[0];
  if (!active) return null;

  return (
    <Alert className="rounded-none border-x-0 border-t-0 border-destructive/40 bg-destructive/12">
      <LifeBuoy className="size-4 text-destructive" />
      <AlertTitle className="text-destructive">
        Acesso de suporte ativo — {active.tenant.name} · expira em{" "}
        {new Date(active.session.expires_at).toLocaleTimeString("pt-BR")}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>Justificativa registrada: “{active.session.justification}”. Todas as ações ficam auditadas.</span>
        <Button asChild size="sm" variant="outline">
          <Link to="/tenants/$tenantId" params={{ tenantId: active.tenant.id }}>
            Gerenciar acesso
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
