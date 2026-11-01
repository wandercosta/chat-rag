import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DealBoard } from "@/components/deals/deal-board";
import { DealDialog } from "@/components/deals/deal-dialog";
import { StagesDialog } from "@/components/deals/stages-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dealsApi } from "@/lib/deals-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/funil")({
  head: () => ({
    meta: [
      { title: "Funil de vendas — ChatRAG" },
      {
        name: "description",
        content: "Negócios em kanban: etapas do funil, valor, responsável e contato.",
      },
      { property: "og:title", content: "Funil de vendas — ChatRAG" },
      {
        property: "og:description",
        content: "Acompanhe cada negócio do primeiro contato ao fechamento.",
      },
    ],
  }),
  // Link do contato: /funil?negocio=<id> abre o negocio.
  validateSearch: (search: Record<string, unknown>): { negocio?: string } =>
    typeof search.negocio === "string" ? { negocio: search.negocio } : {},
  component: FunnelPage,
});

function FunnelPage() {
  const { tenantId, can, profile } = useSession();
  const { negocio } = Route.useSearch();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ dealId: string | null } | null>(
    negocio ? { dealId: negocio } : null,
  );
  const canWrite = can("deals_write");
  const isAdmin = profile === "Administrador";

  const pipelinesQuery = useQuery({
    queryKey: ["pipelines", tenantId],
    queryFn: () => dealsApi.pipelines(tenantId!),
    enabled: !!tenantId,
  });
  // Negocio aberto pelo link pode estar em outro funil que o primeiro.
  const linked = useQuery({
    queryKey: ["deal", tenantId, negocio],
    queryFn: () => dealsApi.get(tenantId!, negocio!),
    enabled: !!tenantId && !!negocio,
  });
  const pipelines = pipelinesQuery.data ?? [];
  const pipeline =
    pipelines.find((p) => p.id === (pipelineId ?? linked.data?.pipelineId)) ?? pipelines[0];

  const dealsQuery = useQuery({
    queryKey: ["deals", tenantId, pipeline?.id],
    queryFn: () => dealsApi.list(tenantId!, { pipelineId: pipeline!.id }),
    enabled: !!tenantId && !!pipeline,
  });

  return (
    <>
      <PageHeader
        title="Funil de vendas"
        description="Arraste o negócio entre as etapas. Ganho e perdido fecham o negócio."
        actions={
          pipeline && (
            <div className="flex flex-wrap gap-2">
              {pipelines.length > 1 && (
                <Select value={pipeline.id} onValueChange={setPipelineId}>
                  <SelectTrigger className="h-9 w-44" aria-label="Funil">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isAdmin && tenantId && (
                <StagesDialog tenantId={tenantId} pipeline={pipeline} onCreated={setPipelineId} />
              )}
              {canWrite && (
                <Button size="sm" onClick={() => setDialog({ dealId: null })}>
                  <Plus /> Novo negócio
                </Button>
              )}
            </div>
          )
        }
      />

      {!tenantId && (
        <Card className="p-6 text-sm text-muted-foreground">
          O funil é de cada organização. Abra uma sessão de suporte no tenant para ver o dele.
        </Card>
      )}
      {pipelinesQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {tenantId && pipeline && (
        <>
          <DealBoard
            tenantId={tenantId}
            pipeline={pipeline}
            deals={dealsQuery.data ?? []}
            canWrite={canWrite}
            onOpen={(dealId) => setDialog({ dealId })}
          />
          <DealDialog
            tenantId={tenantId}
            pipeline={pipeline}
            dealId={dialog?.dealId ?? null}
            canWrite={canWrite}
            canDelete={isAdmin}
            open={!!dialog}
            onOpenChange={(open) => !open && setDialog(null)}
          />
        </>
      )}
    </>
  );
}
