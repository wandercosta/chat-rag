import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api-client";
import { inboxSettingsApi } from "@/lib/inbox-api";

/** Meta de primeira resposta (SLA) e e-mail de atribuicao (so o administrador). */
export function InboxSettingsDialog({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [email, setEmail] = useState(false);

  const query = useQuery({
    queryKey: ["inbox-settings", tenantId],
    queryFn: () => inboxSettingsApi.get(tenantId!),
    enabled: !!tenantId,
  });
  useEffect(() => {
    if (!open || !query.data) return;
    setMinutes(query.data.firstResponseMinutes?.toString() ?? "");
    setEmail(query.data.emailOnAssignment);
  }, [open, query.data]);

  const save = useMutation({
    mutationFn: () =>
      inboxSettingsApi.save(tenantId!, {
        firstResponseMinutes: minutes.trim() ? Number(minutes) : null,
        emailOnAssignment: email,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["inbox-settings", tenantId], data);
      void queryClient.invalidateQueries({ queryKey: ["inbox", tenantId] });
      toast.success("Configuração salva");
      setOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  const emailAvailable = query.data?.emailAvailable ?? false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 />
          Prazo e e-mail
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Prazo de resposta e e-mail</DialogTitle>
          <DialogDescription>
            A fila marca as conversas que passaram do prazo sem resposta, e o Desempenho mostra
            quantas foram respondidas dentro dele.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sla-minutes">Primeira resposta em até (minutos)</Label>
            <Input
              id="sla-minutes"
              type="number"
              min={1}
              max={10080}
              placeholder="Sem prazo"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Contado do pedido de atendente até a primeira resposta de alguém da equipe. Deixe
              vazio para não usar prazo.
            </p>
          </div>
          <label className="flex items-start gap-3">
            <Switch
              checked={email}
              onCheckedChange={setEmail}
              disabled={!emailAvailable}
              aria-label="E-mail ao receber conversa"
            />
            <span className="space-y-0.5 text-sm">
              <span className="block font-medium">E-mail ao receber conversa</span>
              <span className="block text-xs text-muted-foreground">
                {emailAvailable
                  ? "Quem recebe uma conversa atribuída ou transferida por outra pessoa ganha um e-mail com o link (sem dados do cliente)."
                  : "Indisponível: a plataforma ainda não tem servidor de e-mail (SMTP) configurado."}
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
