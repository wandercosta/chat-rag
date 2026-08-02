import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Bot, Library, MessageSquare, SearchX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { assistantsApi, conversationsApi, gapsApi, sourcesApi, topicsApi } from "@/lib/api-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão geral da organização — ChatRAG" },
      {
        name: "description",
        content: "Resumo de assistentes, base de conhecimento, conversas e lacunas da organização.",
      },
      { property: "og:title", content: "Visão geral da organização — ChatRAG" },
      {
        property: "og:description",
        content: "Resumo operacional dos assistentes de IA da sua organização.",
      },
    ],
  }),
  component: TenantOverview,
});

function TenantOverview() {
  const { tenantName, profile, tenantId } = useSession();

  const assistantsQuery = useQuery({
    queryKey: ["assistants", tenantId],
    queryFn: () => assistantsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const topicsQuery = useQuery({
    queryKey: ["topics", tenantId],
    queryFn: () => topicsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const gapsQuery = useQuery({
    queryKey: ["gaps", tenantId],
    queryFn: () => gapsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const conversationsQuery = useQuery({
    queryKey: ["conversations", tenantId],
    queryFn: () => conversationsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  // Fontes vivem por topico; para contar as prontas e preciso varrer todos.
  const sourcesQueries = useQueries({
    queries: (topicsQuery.data ?? []).map((t) => ({
      queryKey: ["sources", tenantId, t.id],
      queryFn: () => sourcesApi.list(tenantId!, t.id),
      enabled: !!tenantId,
    })),
  });

  const allSources = sourcesQueries.flatMap((q) => q.data ?? []);
  const assistants = assistantsQuery.data ?? [];
  const gaps = gapsQuery.data ?? [];

  const metrics = [
    {
      label: "Assistentes publicados",
      value: assistants.filter((a) => a.status === "publicado").length,
      icon: Bot,
    },
    {
      label: "Fontes indexadas",
      value: allSources.filter((s) => s.status === "pronta").length,
      icon: Library,
    },
    {
      label: "Conversas registradas",
      value: conversationsQuery.data?.length ?? 0,
      icon: MessageSquare,
    },
    {
      label: "Lacunas pendentes",
      value: gaps.filter((g) => g.status === "pendente").length,
      icon: SearchX,
    },
  ];

  const recentAssistants = assistants.slice(0, 4);
  const topGaps = gaps.slice(0, 4);

  return (
    <>
      <PageHeader
        title={tenantName}
        description={`Sessão como ${profile ?? "—"}. Os cartões abaixo resumem o consumo da organização.`}
      />
      <ActivationBanner />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Assistentes recentes</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/assistentes">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {assistantsQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            )}
            {assistantsQuery.isSuccess && recentAssistants.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum assistente ainda.</p>
            )}
            {recentAssistants.map((a) => (
              <Link
                key={a.id}
                to="/assistentes/$assistantId"
                params={{ assistantId: a.id }}
                className="flex items-center justify-between rounded-md border p-3 transition-colors hover:border-primary/40"
              >
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.model_id} · atualizado em{" "}
                    {new Date(a.updated_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Lacunas mais frequentes</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/lacunas">Ver todas</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {gapsQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {gapsQuery.isSuccess && topGaps.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma lacuna registrada.</p>
            )}
            {topGaps.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0 pr-3">
                  <p className="truncate text-sm font-medium">{g.question_normalized}</p>
                  <p className="text-xs text-muted-foreground">{g.frequency}x</p>
                </div>
                <StatusBadge status={g.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
