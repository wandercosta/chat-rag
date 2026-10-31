import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { inboxApi, sectorsApi, type InboxSector } from "@/lib/inbox-api";

/**
 * Setores da caixa de entrada (so o administrador). Cada setor tem quem
 * atende nele; quem e Atendente ve na fila as conversas sem setor e as dos
 * seus setores.
 */
export function SectorsDialog({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const sectorsQuery = useQuery({
    queryKey: ["inbox-sectors", tenantId],
    queryFn: () => sectorsApi.list(tenantId!),
    enabled: !!tenantId,
  });
  const agentsQuery = useQuery({
    queryKey: ["inbox-agents", tenantId],
    queryFn: () => inboxApi.agents(tenantId!),
    enabled: !!tenantId,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["inbox-sectors", tenantId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar");

  const create = useMutation({
    mutationFn: () => sectorsApi.create(tenantId!, name.trim()),
    onSuccess: () => {
      setName("");
      void invalidate();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: (input: { id: string; memberIds: string[] }) =>
      sectorsApi.update(tenantId!, input.id, { memberIds: input.memberIds }),
    onSuccess: () => void invalidate(),
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => sectorsApi.remove(tenantId!, id),
    onSuccess: () => {
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ["inbox", tenantId] });
    },
    onError,
  });

  function toggle(sector: InboxSector, userId: string, on: boolean) {
    const memberIds = on
      ? [...sector.memberIds, userId]
      : sector.memberIds.filter((id) => id !== userId);
    update.mutate({ id: sector.id, memberIds });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users />
          Setores
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Setores</DialogTitle>
          <DialogDescription>
            Agrupe quem atende (ex.: Financeiro, Suporte). Conversas transferidas para um setor
            aparecem na fila de quem está nele; as sem setor aparecem para todos.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-80 space-y-3 overflow-y-auto">
          {sectorsQuery.data?.length === 0 && (
            <li className="text-sm text-muted-foreground">Nenhum setor ainda.</li>
          )}
          {sectorsQuery.data?.map((s) => (
            <li key={s.id} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{s.name}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Excluir setor ${s.name}`}
                  onClick={() => {
                    if (window.confirm(`Excluir ${s.name}? As conversas dele voltam à fila geral.`))
                      remove.mutate(s.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {agentsQuery.data?.map((a) => (
                  <label key={a.userId} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={s.memberIds.includes(a.userId)}
                      disabled={update.isPending}
                      onCheckedChange={(on) => toggle(s, a.userId, on === true)}
                    />
                    <span className="truncate">{a.email}</span>
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input
            placeholder="Nome do setor"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            Criar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
