import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { inboxApi } from "@/lib/inbox-api";
import { dealsApi, formatCents, parseMoney, type Pipeline, type DealDetail } from "@/lib/deals-api";
import { ContactPicker } from "./contact-picker";

interface FormState {
  title: string;
  value: string;
  contact: { id: string; label: string } | null;
  ownerUserId: string;
  expectedCloseDate: string;
  stageId: string;
}

const NO_OWNER = "ninguem";

function fromDeal(deal: DealDetail | undefined, pipeline: Pipeline): FormState {
  return {
    title: deal?.title ?? "",
    value: deal?.valueCents != null ? (deal.valueCents / 100).toFixed(2).replace(".", ",") : "",
    contact: deal?.contactId ? { id: deal.contactId, label: deal.contactLabel ?? "Contato" } : null,
    ownerUserId: deal?.ownerUserId ?? "",
    expectedCloseDate: deal?.expectedCloseDate ?? "",
    stageId: deal?.stageId ?? pipeline.stages.find((s) => s.kind === "aberta")?.id ?? "",
  };
}

/**
 * Criar ou editar negocio. `dealId` null = novo (com contato ja escolhido
 * quando vem da pagina do contato).
 */
export function DealDialog({
  tenantId,
  pipeline,
  dealId,
  initialContact,
  canWrite,
  canDelete,
  open,
  onOpenChange,
}: {
  tenantId: string;
  pipeline: Pipeline;
  dealId: string | null;
  initialContact?: { id: string; label: string };
  canWrite: boolean;
  canDelete: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["deal", tenantId, dealId],
    queryFn: () => dealsApi.get(tenantId, dealId!),
    enabled: open && !!dealId,
  });
  const agents = useQuery({
    queryKey: ["inbox-agents", tenantId],
    queryFn: () => inboxApi.agents(tenantId),
    enabled: open && canWrite,
  });
  const [form, setForm] = useState<FormState>(() => fromDeal(undefined, pipeline));

  useEffect(() => {
    if (!open) return;
    if (dealId && detail.data) setForm(fromDeal(detail.data, pipeline));
    if (!dealId) setForm({ ...fromDeal(undefined, pipeline), contact: initialContact ?? null });
  }, [open, dealId, detail.data, pipeline, initialContact]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["deals", tenantId] });
    void queryClient.invalidateQueries({ queryKey: ["deal", tenantId] });
  };
  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o negócio");

  const save = useMutation({
    mutationFn: () => {
      const input = {
        title: form.title.trim(),
        valueCents: parseMoney(form.value),
        contactId: form.contact?.id ?? null,
        ownerUserId: form.ownerUserId || null,
        expectedCloseDate: form.expectedCloseDate || null,
      };
      return dealId
        ? dealsApi.update(tenantId, dealId, input)
        : dealsApi.create(tenantId, { ...input, pipelineId: pipeline.id, stageId: form.stageId });
    },
    onSuccess: () => {
      toast.success(dealId ? "Negócio salvo" : "Negócio criado");
      refresh();
      onOpenChange(false);
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => dealsApi.remove(tenantId, dealId!),
    onSuccess: () => {
      toast.success("Negócio excluído");
      refresh();
      onOpenChange(false);
    },
    onError: fail,
  });

  const stageName = (id: string | null) => pipeline.stages.find((s) => s.id === id)?.name ?? "—";
  const deal = detail.data;
  const disabled = !canWrite;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dealId ? "Negócio" : "Novo negócio"}</DialogTitle>
          <DialogDescription>
            {deal
              ? `${stageName(deal.stageId)}${deal.valueCents != null ? ` · ${formatCents(deal.valueCents)}` : ""}`
              : `Funil ${pipeline.name}`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.title.trim() && !disabled) save.mutate();
          }}
        >
          {deal && deal.status !== "aberto" && (
            <Badge variant={deal.status === "ganho" ? "secondary" : "destructive"}>
              {deal.status === "ganho" ? "Ganho" : "Perdido"}
              {deal.lostReason && ` · ${deal.lostReason}`}
            </Badge>
          )}
          <div className="space-y-1">
            <Label htmlFor="deal-title">Título</Label>
            <Input
              id="deal-title"
              maxLength={200}
              value={form.title}
              disabled={disabled}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="deal-value">Valor (R$)</Label>
              <Input
                id="deal-value"
                inputMode="decimal"
                placeholder="0,00"
                value={form.value}
                disabled={disabled}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="deal-date">Previsão de fechamento</Label>
              <Input
                id="deal-date"
                type="date"
                value={form.expectedCloseDate}
                disabled={disabled}
                onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Contato</Label>
            <ContactPicker
              tenantId={tenantId}
              value={form.contact?.id ?? null}
              label={form.contact?.label ?? null}
              disabled={disabled}
              onChange={(contact) => setForm({ ...form, contact })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Select
                value={form.ownerUserId || NO_OWNER}
                disabled={disabled}
                onValueChange={(v) => setForm({ ...form, ownerUserId: v === NO_OWNER ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={deal?.ownerEmail ?? "Ninguém"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_OWNER}>Ninguém</SelectItem>
                  {agents.data?.map((a) => (
                    <SelectItem key={a.userId} value={a.userId}>
                      {a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!dealId && (
              <div className="space-y-1">
                <Label>Etapa</Label>
                <Select
                  value={form.stageId}
                  onValueChange={(stageId) => setForm({ ...form, stageId })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pipeline.stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {deal && deal.history.length > 0 && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Histórico</p>
              {deal.history.map((h) => (
                <p key={`${h.changedAt}-${h.toStageId}`}>
                  {new Date(h.changedAt).toLocaleString("pt-BR")} ·{" "}
                  {h.fromStageId ? `${stageName(h.fromStageId)} → ` : "criado em "}
                  {stageName(h.toStageId)}
                  {h.changedByEmail && ` · ${h.changedByEmail}`}
                </p>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {dealId && canDelete ? (
              <Button
                type="button"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("Excluir este negócio? Não dá para desfazer."))
                    remove.mutate();
                }}
              >
                Excluir
              </Button>
            ) : (
              <span />
            )}
            {canWrite && (
              <Button type="submit" disabled={!form.title.trim() || save.isPending}>
                {dealId ? "Salvar" : "Criar negócio"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
