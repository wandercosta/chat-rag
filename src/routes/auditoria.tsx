import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auditApi, usageApi } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria e uso — ChatRAG" },
      { name: "description", content: "Eventos administrativos e de segurança: quem fez o quê e quando." },
      { property: "og:title", content: "Auditoria e uso — ChatRAG" },
      { property: "og:description", content: "Trilha de auditoria filtrável por tipo de evento e período." },
    ],
  }),
  component: AuditPage,
});

const usageLabels: Record<string, string> = {
  rag_query: "Respostas com contexto",
  no_context: "Respostas sem contexto",
  widget_loaded: "Widget carregado",
  widget_rate_limited: "Widget bloqueado por limite",
  indexing_succeeded: "Indexações concluídas",
  indexing_failed: "Indexações com erro",
};

function AuditPage() {
  const { can, tenantId } = useSession();
  const [type, setType] = useState("todos");

  const auditQuery = useQuery({
    queryKey: ["audit", tenantId],
    queryFn: () => auditApi.list(tenantId!),
    enabled: !!tenantId && can("audit"),
  });

  const usageQuery = useQuery({
    queryKey: ["usage", tenantId],
    queryFn: () => usageApi.getSummary(tenantId!),
    enabled: !!tenantId && can("audit"),
  });

  if (!can("audit")) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Seu perfil não acessa a auditoria.</Card>;
  }

  const events = auditQuery.data ?? [];
  const types = Array.from(new Set(events.map((e) => e.type)));
  const rows = type === "todos" ? events : events.filter((e) => e.type === type);
  const usage = usageQuery.data;

  return (
    <>
      <PageHeader title="Auditoria e uso" description="Registro imutável de ações administrativas e de segurança." />

      {usage && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(usage.eventCounts).map(([key, count]) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {usageLabels[key] ?? key}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{count}</p>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Latência média do RAG</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {usage.avgRagLatencyMs !== null ? `${usage.avgRagLatencyMs} ms` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">últimos {usage.periodDays} dias</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="grid gap-2">
          <Label htmlFor="a-type">Tipo de evento</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="a-type" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {auditQuery.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
        {auditQuery.isSuccess && rows.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">Nenhum evento de auditoria registrado.</p>
        )}
        {rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ação</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Alvo</TableHead>
                <TableHead>Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.action}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {e.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.target ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
