import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { NewCampaignDialog } from "@/components/campaigns/new-campaign-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { campaignStatusLabel, campaignsApi } from "@/lib/campaigns-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/campanhas/")({
  head: () => ({
    meta: [
      { title: "Campanhas — ChatRAG" },
      {
        name: "description",
        content: "Envios para segmentos de contatos com opt-in, agendados e medidos.",
      },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const { tenantId, profile } = useSession();
  const listQuery = useQuery({
    queryKey: ["campaigns", tenantId],
    queryFn: () => campaignsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Mensagens para um segmento de contatos. Só recebe quem aceitou campanhas; quem responder “SAIR” deixa de receber."
        actions={profile === "Administrador" ? <NewCampaignDialog tenantId={tenantId} /> : null}
      />
      <Card className="overflow-hidden p-0">
        {listQuery.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
        {listQuery.data?.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
        )}
        {(listQuery.data?.length ?? 0) > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Agendada para</TableHead>
                <TableHead>Criada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      to="/campanhas/$campaignId"
                      params={{ campaignId: c.id }}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{campaignStatusLabel[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
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
