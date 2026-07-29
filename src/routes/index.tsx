import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Library, MessageSquare, SearchX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { assistants, conversations, gaps, knowledgeTopics } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão geral da organização — ChatRAG" },
      { name: "description", content: "Resumo de assistentes, base de conhecimento, conversas e lacunas da organização." },
      { property: "og:title", content: "Visão geral da organização — ChatRAG" },
      { property: "og:description", content: "Resumo operacional dos assistentes de IA da sua organização." },
    ],
  }),
  component: TenantOverview,
});

// TODO(API): GET /api/tenants/{id}/overview
function TenantOverview() {
  const { tenantName, profile } = useSession();
  const sources = knowledgeTopics.flatMap((t) => t.sources);

  const metrics = [
    { label: "Assistentes ativos", value: assistants.filter((a) => a.status === "publicado").length, icon: Bot },
    { label: "Fontes indexadas", value: sources.filter((s) => s.status === "pronta").length, icon: Library },
    { label: "Conversas (30 dias)", value: conversations.length * 312, icon: MessageSquare },
    { label: "Lacunas pendentes", value: gaps.filter((g) => g.status === "pendente").length, icon: SearchX },
  ];

  return (
    <>
      <PageHeader
        title={tenantName}
        description={`Sessão simulada como ${profile}. Os cartões abaixo resumem o consumo da organização.`}
      />
      <ActivationBanner />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{m.label}</CardTitle>
              <m.icon className="size-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{m.value.toLocaleString("pt-BR")}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Assistentes recentes</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/assistentes">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {assistants.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.model} · atualizado em {a.updatedAt}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Lacunas mais frequentes</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/lacunas">Ver todas</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {gaps.slice(0, 4).map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{g.question}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.frequency}x · {g.assistant}
                  </p>
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
