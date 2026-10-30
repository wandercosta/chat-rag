import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api-client";
import { campaignStatusLabel, campaignsApi } from "@/lib/campaigns-api";
import { deliveryLabel } from "@/lib/channels-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/campanhas/$campaignId")({
  head: () => ({
    meta: [
      { title: "Campanha — ChatRAG" },
      { name: "description", content: "Envio, entrega, leitura e respostas de uma campanha." },
    ],
  }),
  component: CampaignPage,
});

const recipientLabel = {
  pendente: "Na fila",
  enviada: "Enviada",
  falhou: "Falhou",
  ignorada: "Saiu antes do envio",
} as const;

function CampaignPage() {
  const { campaignId } = Route.useParams();
  const { tenantId, profile } = useSession();
  const queryClient = useQueryClient();
  const [at, setAt] = useState("");

  const detailQuery = useQuery({
    queryKey: ["campaign", tenantId, campaignId],
    queryFn: () => campaignsApi.get(tenantId!, campaignId),
    enabled: !!tenantId,
    // Enquanto envia, os numeros mudam a cada lote.
    refetchInterval: (q) =>
      q.state.data && ["agendada", "enviando"].includes(q.state.data.status) ? 10_000 : false,
  });
  const onDone = (data: unknown) => {
    queryClient.setQueryData(["campaign", tenantId, campaignId], data);
    void queryClient.invalidateQueries({ queryKey: ["campaigns", tenantId] });
  };
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir");
  const schedule = useMutation({
    mutationFn: () =>
      campaignsApi.schedule(tenantId!, campaignId, at ? new Date(at).toISOString() : undefined),
    onSuccess: onDone,
    onError,
  });
  const cancel = useMutation({
    mutationFn: () => campaignsApi.cancel(tenantId!, campaignId),
    onSuccess: onDone,
    onError,
  });

  const c = detailQuery.data;
  const isAdmin = profile === "Administrador";
  const stats = c?.stats;
  const cards = stats
    ? [
        ["Público", stats.total],
        ["Enviadas", stats.sent],
        ["Entregues", stats.delivered],
        ["Lidas", stats.read],
        ["Responderam", stats.replied],
        ["Falharam", stats.failed],
        ["Saíram antes", stats.skipped],
        ["Na fila", stats.pending],
      ]
    : [];

  return (
    <>
      <Link
        to="/campanhas"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> Campanhas
      </Link>
      <PageHeader
        title={c?.name ?? "Campanha"}
        description={
          c?.template_params.length
            ? `Variáveis: ${c.template_params.join(", ")}`
            : (c?.text ?? undefined)
        }
        actions={
          c && isAdmin ? (
            <>
              <Badge variant="outline">{campaignStatusLabel[c.status]}</Badge>
              {["rascunho", "agendada", "enviando"].includes(c.status) && (
                <Button size="sm" variant="outline" onClick={() => cancel.mutate()}>
                  Cancelar
                </Button>
              )}
            </>
          ) : null
        }
      />

      {c?.status === "rascunho" && isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Agendar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Input
              type="datetime-local"
              className="w-60"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              aria-label="Data e hora do envio"
            />
            <Button disabled={schedule.isPending} onClick={() => schedule.mutate()}>
              {at ? "Agendar" : "Enviar agora"}
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              O público é fixado na hora de agendar: contatos que entrarem no segmento depois não
              recebem esta campanha.
            </p>
          </CardContent>
        </Card>
      )}

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {(c?.recipients.length ?? 0) > 0 && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                <TableHead>Envio</TableHead>
                <TableHead>Recibo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c?.recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      to="/contatos/$contactId"
                      params={{ contactId: r.contact_id }}
                      className="hover:underline"
                    >
                      {r.label}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {recipientLabel[r.status]}
                    {r.error && <span className="block text-xs text-destructive">{r.error}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.delivery_status ? deliveryLabel[r.delivery_status] : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
