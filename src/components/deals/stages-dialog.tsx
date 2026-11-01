import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { dealsApi, stageKindLabel, type Pipeline, type StageKind } from "@/lib/deals-api";

/**
 * Configuracao do funil (so Administrador): nome, etapas, ordem e novo funil.
 * Etapa com negocio ou ultima do seu tipo nao sai (o servidor explica no 409).
 */
export function StagesDialog({
  tenantId,
  pipeline,
  onCreated,
}: {
  tenantId: string;
  pipeline: Pipeline;
  onCreated: (pipelineId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StageKind>("aberta");
  const [newPipeline, setNewPipeline] = useState("");

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["pipelines", tenantId] });
  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar");

  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: refresh,
    onError: fail,
  });
  const createPipeline = useMutation({
    mutationFn: () => dealsApi.createPipeline(tenantId, newPipeline.trim()),
    onSuccess: (created) => {
      setNewPipeline("");
      refresh();
      onCreated(created.id);
      toast.success("Funil criado com as etapas padrão");
    },
    onError: fail,
  });

  const ids = pipeline.stages.map((s) => s.id);
  const swap = (from: number, to: number) => {
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    run.mutate(() => dealsApi.reorderStages(tenantId, pipeline.id, next));
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 /> Etapas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Funil {pipeline.name}</DialogTitle>
          <DialogDescription>
            Etapas viram colunas do kanban. Ganho e perdido fecham o negócio; o funil precisa de ao
            menos uma etapa de cada tipo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            aria-label="Nome do funil"
            defaultValue={pipeline.name}
            maxLength={80}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value && value !== pipeline.name) {
                run.mutate(() => dealsApi.renamePipeline(tenantId, pipeline.id, value));
              }
            }}
          />
          <ul className="space-y-1">
            {pipeline.stages.map((s, i) => (
              <li key={s.id} className="flex items-center gap-1">
                <Input
                  className="h-8"
                  aria-label={`Nome da etapa ${s.name}`}
                  defaultValue={s.name}
                  maxLength={80}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== s.name) {
                      run.mutate(() => dealsApi.renameStage(tenantId, s.id, value));
                    }
                  }}
                />
                <Badge variant="outline" className="shrink-0">
                  {stageKindLabel[s.kind]}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Subir ${s.name}`}
                  disabled={i === 0 || run.isPending}
                  onClick={() => swap(i, i - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Descer ${s.name}`}
                  disabled={i === ids.length - 1 || run.isPending}
                  onClick={() => swap(i, i + 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Excluir ${s.name}`}
                  disabled={run.isPending}
                  onClick={() => run.mutate(() => dealsApi.removeStage(tenantId, s.id))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = name.trim();
              if (!value) return;
              run.mutate(() => dealsApi.addStage(tenantId, pipeline.id, value, kind));
              setName("");
            }}
          >
            <Input
              className="h-9"
              placeholder="Nova etapa"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Select value={kind} onValueChange={(v) => setKind(v as StageKind)}>
              <SelectTrigger className="h-9 w-40" aria-label="Tipo da etapa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(stageKindLabel) as StageKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {stageKindLabel[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={!name.trim()}>
              Adicionar
            </Button>
          </form>
        </div>

        <form
          className="flex gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (newPipeline.trim()) createPipeline.mutate();
          }}
        >
          <Input
            className="h-9"
            placeholder="Novo funil (ex.: Pós-venda)"
            maxLength={80}
            value={newPipeline}
            onChange={(e) => setNewPipeline(e.target.value)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={!newPipeline.trim()}>
            Criar funil
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
