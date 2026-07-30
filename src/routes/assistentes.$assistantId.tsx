import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, assistantsApi, modelsApi, type Assistant } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/assistentes/$assistantId")({
  head: () => ({
    meta: [
      { title: "Assistente — ChatRAG" },
      { name: "description", content: "Identidade, modelo e retenção do assistente." },
      { property: "og:title", content: "Configuração do assistente — ChatRAG" },
      { property: "og:description", content: "Edite nome, modelo, instruções e retenção do assistente." },
    ],
  }),
  component: AssistantDetail,
});

const retentionOptions = [
  { value: "0", label: "Não reter" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
];

function AssistantDetail() {
  const { assistantId } = Route.useParams();
  const { can, tenantId } = useSession();
  const readOnly = !can("write");
  const queryClient = useQueryClient();

  const assistantQuery = useQuery({
    queryKey: ["assistant", tenantId, assistantId],
    queryFn: () => assistantsApi.get(tenantId!, assistantId),
    enabled: !!tenantId,
  });

  const modelsQuery = useQuery({
    queryKey: ["allowed-models", tenantId],
    queryFn: () => modelsApi.listAllowed(tenantId!),
    enabled: !!tenantId,
  });

  const [name, setName] = useState("");
  const [modelId, setModelId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [status, setStatus] = useState<Assistant["status"]>("rascunho");
  const [retentionDays, setRetentionDays] = useState<string>("90");

  useEffect(() => {
    if (!assistantQuery.data) return;
    setName(assistantQuery.data.name);
    setModelId(assistantQuery.data.model_id);
    setInstructions(assistantQuery.data.instructions ?? "");
    setStatus(assistantQuery.data.status);
    setRetentionDays(String(assistantQuery.data.retention_days ?? 90));
  }, [assistantQuery.data]);

  const updateAssistant = useMutation({
    mutationFn: () =>
      assistantsApi.update(tenantId!, assistantId, {
        name,
        modelId,
        instructions: instructions || null,
        status,
        retentionDays: retentionDays === "0" ? null : Number(retentionDays),
      }),
    onSuccess: (updated) => {
      toast.success("Configuração salva");
      queryClient.setQueryData(["assistant", tenantId, assistantId], updated);
      queryClient.invalidateQueries({ queryKey: ["assistants", tenantId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o assistente");
    },
  });

  if (assistantQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  if (assistantQuery.isError) {
    return <p className="text-sm text-destructive">Assistente não encontrado.</p>;
  }

  const assistant = assistantQuery.data;
  if (!assistant) return null;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/assistentes">
          <ArrowLeft /> Assistentes
        </Link>
      </Button>
      <PageHeader
        title={assistant.name}
        description={`Modelo ${assistant.model_id} · atualizado em ${new Date(assistant.updated_at).toLocaleDateString("pt-BR")}`}
        actions={
          <>
            <StatusBadge status={assistant.status} className="h-9 px-3 text-sm" />
            <Button
              disabled={readOnly || updateAssistant.isPending || !name || !modelId}
              onClick={() => updateAssistant.mutate()}
            >
              <Save /> {updateAssistant.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      />
      <ActivationBanner context="respostas do assistente" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identidade</CardTitle>
            <CardDescription>Como o assistente se apresenta ao visitante.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="a-name">Nome</Label>
              <Input id="a-name" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-model">Modelo</Label>
              <Select value={modelId} onValueChange={setModelId} disabled={readOnly}>
                <SelectTrigger id="a-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelsQuery.data?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} {m.note ? `· ${m.note}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Assistant["status"])} disabled={readOnly}>
                <SelectTrigger id="a-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="publicado">Publicado</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-instr">Instruções (opcional)</Label>
              <Textarea
                id="a-instr"
                rows={5}
                disabled={readOnly}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Tom de voz, escopo de atendimento, o que evitar…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retenção</CardTitle>
            <CardDescription>Por quanto tempo o histórico de conversas deste assistente fica guardado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="a-ret">Retenção de histórico</Label>
              <Select value={retentionDays} onValueChange={setRetentionDays} disabled={readOnly}>
                <SelectTrigger id="a-ret">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {retentionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sem um valor aqui, vale a retenção da organização (e, na falta dela, 90 dias).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
