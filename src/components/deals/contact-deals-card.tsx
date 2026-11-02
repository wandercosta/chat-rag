import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dealsApi, formatCents } from "@/lib/deals-api";
import { useSession } from "@/lib/session";
import { DealDialog } from "./deal-dialog";

/** Negocios do contato na pagina dele, com atalho para criar um novo (ADR-008). */
export function ContactDealsCard({
  tenantId,
  contactId,
  contactLabel,
}: {
  tenantId: string;
  contactId: string;
  contactLabel: string;
}) {
  const { can, profile } = useSession();
  const [open, setOpen] = useState(false);
  const pipelines = useQuery({
    queryKey: ["pipelines", tenantId],
    queryFn: () => dealsApi.pipelines(tenantId),
  });
  const deals = useQuery({
    queryKey: ["deals", tenantId, "contato", contactId],
    queryFn: () => dealsApi.list(tenantId, { contactId }),
  });
  const pipeline = pipelines.data?.[0];
  const stageName = (stageId: string) =>
    pipelines.data?.flatMap((p) => p.stages).find((s) => s.id === stageId)?.name ?? "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Negócios</CardTitle>
        {can("deals_write") && pipeline && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus /> Novo
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {deals.isSuccess && deals.data.length === 0 && (
          <p className="text-muted-foreground">Nenhum negócio ainda.</p>
        )}
        {deals.data?.map((d) => (
          <Link
            key={d.id}
            to="/funil"
            search={{ negocio: d.id }}
            className="block space-y-0.5 border-b pb-2 last:border-0 hover:underline"
          >
            <span className="font-medium">{d.title}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={d.status === "perdido" ? "destructive" : "outline"}>
                {stageName(d.stageId)}
              </Badge>
              {d.valueCents != null && formatCents(d.valueCents)}
            </span>
          </Link>
        ))}
      </CardContent>
      {pipeline && (
        <DealDialog
          tenantId={tenantId}
          pipeline={pipeline}
          dealId={null}
          initialContact={{ id: contactId, label: contactLabel }}
          canWrite={can("deals_write")}
          canDelete={profile === "Administrador"}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </Card>
  );
}
