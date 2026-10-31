import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { inboxApi, sectorsApi } from "@/lib/inbox-api";

const KEEP = "manter";
const QUEUE = "fila";
const NO_SECTOR = "nenhum";

/**
 * Transferir a conversa para outra pessoa e/ou setor. O motivo vira nota
 * interna (o cliente nao ve) e quem recebe e avisado no painel.
 */
export function TransferDialog({
  tenantId,
  conversationId,
  currentSectorId,
  onDone,
}: {
  tenantId: string;
  conversationId: string;
  currentSectorId: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(QUEUE);
  const [sectorId, setSectorId] = useState(KEEP);
  const [reason, setReason] = useState("");

  const agentsQuery = useQuery({
    queryKey: ["inbox-agents", tenantId],
    queryFn: () => inboxApi.agents(tenantId),
    enabled: open,
  });
  const sectorsQuery = useQuery({
    queryKey: ["inbox-sectors", tenantId],
    queryFn: () => sectorsApi.list(tenantId),
    enabled: open,
  });

  const transfer = useMutation({
    mutationFn: () =>
      inboxApi.transfer(tenantId, conversationId, {
        userId: userId === QUEUE ? null : userId,
        ...(sectorId !== KEEP && { sectorId: sectorId === NO_SECTOR ? null : sectorId }),
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Conversa transferida");
      setOpen(false);
      setReason("");
      onDone();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível transferir"),
  });

  const sectors = sectorsQuery.data ?? [];
  const currentName = sectors.find((s) => s.id === currentSectorId)?.name;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowRightLeft />
          Transferir
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir conversa</DialogTitle>
          <DialogDescription>
            Escolha quem recebe ou mande para a fila de um setor. O motivo fica como nota interna.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Pessoa</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={QUEUE}>Ninguém (fica na fila)</SelectItem>
                {agentsQuery.data?.map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>
                    {a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Setor</Label>
            <Select value={sectorId} onValueChange={setSectorId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>
                  Manter {currentName ? `(${currentName})` : "(sem setor)"}
                </SelectItem>
                {currentSectorId && <SelectItem value={NO_SECTOR}>Sem setor</SelectItem>}
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="transfer-reason">Motivo (opcional)</Label>
            <Textarea
              id="transfer-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={transfer.isPending} onClick={() => transfer.mutate()}>
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
