import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { RuleEditorDialog } from "@/components/automations/rule-editor-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api-client";
import {
  actionLabel,
  automationsApi,
  conditionLabel,
  triggerLabel,
  type Rule,
} from "@/lib/automations-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações — ChatRAG" },
      {
        name: "description",
        content: "Regras sem código: quando chegar mensagem ou faltar resposta, faça isto.",
      },
    ],
  }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const { tenantId, profile } = useSession();
  const isAdmin = profile === "Administrador";
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [runsOf, setRunsOf] = useState<Rule | null>(null);

  const listQuery = useQuery({
    queryKey: ["automations", tenantId],
    queryFn: () => automationsApi.list(tenantId!),
    enabled: !!tenantId,
  });
  const runsQuery = useQuery({
    queryKey: ["automation-runs", tenantId, runsOf?.id],
    queryFn: () => automationsApi.runs(tenantId!, runsOf!.id),
    enabled: !!tenantId && !!runsOf,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["automations", tenantId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar");
  const toggle = useMutation({
    mutationFn: (r: Rule) => automationsApi.setEnabled(tenantId!, r.id, !r.enabled),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (r: Rule) => automationsApi.remove(tenantId!, r.id),
    onSuccess: refresh,
    onError,
  });

  return (
    <>
      <PageHeader
        title="Automações"
        description="Regras que rodam sozinhas: responder fora do horário, etiquetar por palavra-chave, passar para humano, devolver para a fila quem ficou sem resposta. Rodam antes do assistente e sem IA."
        actions={
          isAdmin ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus />
              Nova regra
            </Button>
          ) : null
        }
      />
      {listQuery.data?.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">Nenhuma regra ainda.</Card>
      )}
      <div className="grid gap-3">
        {listQuery.data?.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {r.name}
                  <Badge variant="outline">versão {r.version}</Badge>
                </CardTitle>
                <CardDescription>
                  <strong>Quando:</strong> {triggerLabel[r.trigger]}.{" "}
                  {r.conditions.length > 0 && (
                    <>
                      <strong>Se:</strong>{" "}
                      {r.conditions.map((c) => conditionLabel[c.type]).join("; ")}.{" "}
                    </>
                  )}
                  <strong>Então:</strong> {r.actions.map((a) => actionLabel[a.type]).join("; ")}.
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  aria-label={`Ligar ${r.name}`}
                  checked={r.enabled}
                  disabled={!isAdmin || toggle.isPending}
                  onCheckedChange={() => toggle.mutate(r)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Histórico"
                  onClick={() => setRunsOf(r)}
                >
                  <History />
                </Button>
                {isAdmin && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar ${r.name}`}
                      onClick={() => {
                        setEditing(r);
                        setEditorOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Excluir ${r.name}`}
                      onClick={() => {
                        if (window.confirm(`Excluir a regra "${r.name}" e o histórico dela?`))
                          remove.mutate(r);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <RuleEditorDialog
        tenantId={tenantId}
        rule={editing}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />

      <Dialog open={!!runsOf} onOpenChange={(v) => !v && setRunsOf(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico: {runsOf?.name}</DialogTitle>
            <DialogDescription>
              As últimas 50 execuções, com a versão da regra que rodou.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {runsQuery.data?.length === 0 && (
              <li className="text-muted-foreground">Ainda não rodou.</li>
            )}
            {runsQuery.data?.map((run) => (
              <li key={run.id} className="rounded-md border p-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {new Date(run.created_at).toLocaleString("pt-BR")} · versão {run.rule_version}
                  </span>
                  <Badge variant={run.status === "ok" ? "secondary" : "destructive"}>
                    {run.status}
                  </Badge>
                </div>
                <p>{run.detail || "—"}</p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
