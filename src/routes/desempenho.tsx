import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { developersApi, formatDuration } from "@/lib/developers-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/desempenho")({
  head: () => ({
    meta: [
      { title: "Desempenho da equipe — ChatRAG" },
      {
        name: "description",
        content: "Tempo de primeira resposta, conversas resolvidas e mensagens por atendente.",
      },
    ],
  }),
  component: MetricsPage,
});

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function MetricsPage() {
  const { tenantId } = useSession();
  const [days, setDays] = useState("30");
  const query = useQuery({
    queryKey: ["agent-metrics", tenantId, days],
    queryFn: () => developersApi.metrics(tenantId!, Number(days)),
    enabled: !!tenantId,
  });
  const report = query.data;

  return (
    <>
      <PageHeader
        title="Desempenho da equipe"
        description="Do pedido de atendimento humano até a primeira resposta, e quem resolveu o quê."
        actions={
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {report && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Pedidos de atendimento" value={report.team.requests} />
            <Stat label="Na fila sem atendente agora" value={report.team.waiting} />
            <Stat label="Resolvidas" value={report.team.resolved} />
            <Stat
              label="Primeira resposta (mediana)"
              value={formatDuration(report.team.firstResponseMedianSeconds)}
            />
          </div>
          {report.team.sla && (
            <p className="text-sm text-muted-foreground">
              Dentro do prazo de {report.team.firstResponseSlaMinutes} min:{" "}
              <span className="font-semibold text-foreground">
                {report.team.sla.total
                  ? `${Math.round((report.team.sla.met / report.team.sla.total) * 100)}%`
                  : "—"}
              </span>{" "}
              ({report.team.sla.met} de {report.team.sla.total} pedidos já respondidos ou com prazo
              vencido).
            </p>
          )}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atendente</TableHead>
                    <TableHead className="text-right">Atribuídas</TableHead>
                    <TableHead className="text-right">Resolvidas</TableHead>
                    <TableHead className="text-right">Mensagens</TableHead>
                    <TableHead className="text-right">1ª resposta (mediana)</TableHead>
                    <TableHead className="text-right">1ª resposta (média)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.agents.map((a) => (
                    <TableRow key={a.userId}>
                      <TableCell>{a.email}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.assigned}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.resolved}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.messagesSent}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(a.firstResponseMedianSeconds)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(a.firstResponseAverageSeconds)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
