import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, PauseCircle, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PlatformUsageSection } from "@/components/platform/platform-usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { masterApi } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/plataforma")({
  head: () => ({
    meta: [
      { title: "Visão geral da plataforma — ChatRAG Master" },
      { name: "description", content: "Organizações da plataforma ChatRAG e seus estados." },
      { property: "og:title", content: "Visão geral da plataforma — ChatRAG Master" },
      { property: "og:description", content: "Organizações, estados e retenção configurada." },
    ],
  }),
  component: PlatformOverview,
});

function PlatformOverview() {
  const { scope } = useSession();

  const tenantsQuery = useQuery({
    queryKey: ["master-tenants"],
    queryFn: () => masterApi.listTenants(),
    enabled: scope === "master",
  });

  if (scope !== "master") {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Esta área é exclusiva do escopo Master.
      </Card>
    );
  }

  const tenants = tenantsQuery.data ?? [];
  const metrics = [
    { label: "Organizações", value: tenants.length, icon: Building2 },
    { label: "Ativas", value: tenants.filter((t) => t.status === "ativo").length, icon: Users },
    {
      label: "Suspensas",
      value: tenants.filter((t) => t.status === "suspenso").length,
      icon: PauseCircle,
    },
  ];

  return (
    <>
      <PageHeader
        title="Visão geral da plataforma"
        description="Organizações provisionadas, seus estados e o consumo de todos os tenants."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{m.label}</CardTitle>
              <m.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        {tenantsQuery.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
        {tenantsQuery.isSuccess && tenants.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            Nenhuma organização provisionada ainda.
          </p>
        )}
        {tenants.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organização</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Retenção</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.slug}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.retention_days ? `${t.retention_days} dias` : "padrão (90 dias)"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/tenants/$tenantId" params={{ tenantId: t.id }}>
                        Detalhes
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <PlatformUsageSection tenants={tenants} />
    </>
  );
}
