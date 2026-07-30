import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/session";
import { assistantsApi, modelsApi, ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/assistentes/")({
  head: () => ({
    meta: [
      { title: "Assistentes — ChatRAG" },
      {
        name: "description",
        content: "Lista de assistentes de IA da organização com status e modelo selecionado.",
      },
      { property: "og:title", content: "Assistentes — ChatRAG" },
      {
        property: "og:description",
        content: "Crie e configure assistentes de IA da sua base de conhecimento.",
      },
    ],
  }),
  component: AssistantsList,
});

function AssistantsList() {
  const { can, tenantId } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [modelId, setModelId] = useState("");
  const [instructions, setInstructions] = useState("");

  const assistantsQuery = useQuery({
    queryKey: ["assistants", tenantId],
    queryFn: () => assistantsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const modelsQuery = useQuery({
    queryKey: ["allowed-models", tenantId],
    queryFn: () => modelsApi.listAllowed(tenantId!),
    enabled: !!tenantId,
  });

  const createAssistant = useMutation({
    mutationFn: () =>
      assistantsApi.create(tenantId!, { name, modelId, instructions: instructions || null }),
    onSuccess: () => {
      toast.success("Assistente criado");
      setOpen(false);
      setName("");
      setModelId("");
      setInstructions("");
      queryClient.invalidateQueries({ queryKey: ["assistants", tenantId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível criar o assistente");
    },
  });

  const noModelsAllowed = modelsQuery.isSuccess && modelsQuery.data.length === 0;

  return (
    <>
      <PageHeader
        title="Assistentes"
        description="Cada assistente responde a partir das coleções de conhecimento selecionadas."
        actions={
          can("write") && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button disabled={noModelsAllowed}>
                  <Plus /> Novo assistente
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Novo assistente</DialogTitle>
                  <DialogDescription>
                    Responde em modo estrito, só com base na sua coleção de conhecimento.
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="grid gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createAssistant.mutate();
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="as-name">Nome</Label>
                    <Input
                      id="as-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="as-model">Modelo</Label>
                    <Select value={modelId} onValueChange={setModelId} required>
                      <SelectTrigger id="as-model">
                        <SelectValue placeholder="Selecione um modelo liberado" />
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
                    <Label htmlFor="as-instr">Instruções (opcional)</Label>
                    <Textarea
                      id="as-instr"
                      rows={4}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createAssistant.isPending || !modelId}>
                      {createAssistant.isPending ? "Criando..." : "Criar assistente"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />
      <ActivationBanner context="publicação do assistente" />
      {noModelsAllowed && (
        <Card className="border-dashed p-4 text-sm text-muted-foreground">
          Nenhum modelo foi liberado para esta organização ainda. Peça ao Master para liberar ao
          menos um modelo antes de criar um assistente.
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assistantsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        )}
        {assistantsQuery.data?.map((a) => (
          <Card key={a.id} className="transition-colors hover:border-primary/40">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{a.name}</CardTitle>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{a.model_id}</p>
              </div>
              <StatusBadge status={a.status} />
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {a.instructions || "Sem instruções adicionais."}
              </p>
            </CardContent>
          </Card>
        ))}
        {assistantsQuery.isSuccess && assistantsQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum assistente ainda.</p>
        )}
      </div>
    </>
  );
}
