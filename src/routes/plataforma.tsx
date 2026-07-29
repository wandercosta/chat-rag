import { createFileRoute } from "@tanstack/react-router";
import { Building2, MessageSquare, Users, Bot } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tenants, usageSeries } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/plataforma")({
  head: () => ({
    meta: [
      { title: "Visão geral da plataforma — ChatRAG Master" },
      { name: "description", content: "Métricas agregadas de todas as organizações da plataforma ChatRAG." },
      { property: "og:title", content: "Visão geral da plataforma — ChatRAG Master" },
      { property: "og:description", content: "Consumo agregado, tenants ativos e evolução de mensagens." },
    ],
  }),
  component: PlatformOverview,
});

// TODO(API): GET /api/master/overview
function PlatformOverview() {
  const { scope } = useSession();
  if (scope !== "master") {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Esta área é exclusiva do escopo Master.
      </Card>
    );
  }

  const metrics = [
    { label: "Organizações", value: tenants.length, icon: Building2 },
    { label: "Tenants ativos", value: tenants.filter((t) => t.status === "ativo").length, icon: Users },
    { label: "Assistentes", value: tenants.reduce((s, t) => s + t.usage.assistants, 0), icon: Bot },
    {
      label: "Mensagens no mês",
      value: tenants.reduce((s, t) => s + t.usage.messagesMonth, 0),
      icon: MessageSquare,
    },
  ];

  return (
    <>
      <PageHeader title="Visão geral da plataforma" description="Números consolidados de todos os tenants." />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagens e conversas por mês</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={usageSeries}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <ReTooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  color: "var(--color-popover-foreground)",
                }}
              />
              <Area
                type="monotone"
                dataKey="mensagens"
                stroke="var(--color-chart-1)"
                fill="url(#g1)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="conversas"
                stroke="var(--color-chart-2)"
                fill="transparent"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organização</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Consumo de mensagens</TableHead>
              <TableHead>Fontes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {t.usage.messagesMonth.toLocaleString("pt-BR")} de {t.limits.messagesMonth.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="tabular-nums">{t.usage.sources}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
