import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type { Organization } from "@/lib/api-client";
import { platformUsageApi } from "@/lib/platform-usage-api";

const CHANNEL_LABELS: Record<string, string> = {
  widget: "Widget",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  messenger: "Messenger",
  playground: "Playground",
};

const number = (value: number) => value.toLocaleString("pt-BR");

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

/**
 * Consumo cruzando todos os tenants: so contagens, nenhum conteudo. Custo
 * estimado fica de fora ate existir uma tabela de precos por modelo.
 */
export function PlatformUsageSection({ tenants }: { tenants: Organization[] }) {
  const [days, setDays] = useState("30");
  const query = useQuery({
    queryKey: ["platform-usage", days],
    queryFn: () => platformUsageApi.get(Number(days)),
  });
  const usage = query.data;
  const nameOf = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;
  const channels = Object.entries(usage?.conversationsByChannel ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Consumo da plataforma</h2>
          <p className="text-sm text-muted-foreground">
            Contagens de todos os tenants, sem conteúdo de conversa. Custo estimado ainda não entra
            (falta a tabela de preços por modelo).
          </p>
        </div>
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
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {query.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar o consumo.</p>
      )}

      {usage && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Mensagens recebidas" value={number(usage.totals.messagesReceived)} />
            <Stat label="Perguntas ao assistente" value={number(usage.totals.ragQueries)} />
            <Stat label="Respostas de atendentes" value={number(usage.totals.agentReplies)} />
            <Stat
              label="Latência média do assistente"
              value={
                usage.totals.avgRagLatencyMs === null
                  ? "—"
                  : `${number(usage.totals.avgRagLatencyMs)} ms`
              }
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Conversas iniciadas por canal</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {channels.length === 0 && (
                <span className="text-muted-foreground">Nenhuma conversa no período.</span>
              )}
              {channels.map(([channel, count]) => (
                <span key={channel}>
                  {CHANNEL_LABELS[channel] ?? channel}{" "}
                  <span className="font-semibold tabular-nums">{number(count)}</span>
                </span>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden p-0">
            {usage.organizations.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Nenhuma atividade no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organização</TableHead>
                    <TableHead className="text-right">Conversas</TableHead>
                    <TableHead className="text-right">Recebidas</TableHead>
                    <TableHead className="text-right">Perguntas ao assistente</TableHead>
                    <TableHead className="text-right">Sem resposta na base</TableHead>
                    <TableHead className="text-right">Respostas de atendentes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.organizations.map((o) => (
                    <TableRow key={o.organizationId}>
                      <TableCell className="font-medium">{nameOf(o.organizationId)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {number(o.conversations)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {number(o.messagesReceived)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {number(o.ragQueries)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {number(o.noContext)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {number(o.agentReplies)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </section>
  );
}
