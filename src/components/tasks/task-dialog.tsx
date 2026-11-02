import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { ContactPicker } from "@/components/deals/contact-picker";
import { ApiError } from "@/lib/api-client";
import { dealsApi } from "@/lib/deals-api";
import { inboxApi } from "@/lib/inbox-api";
import { tasksApi, toLocalInput, type Task } from "@/lib/tasks-api";

const NONE = "nenhum";

interface FormState {
  title: string;
  notes: string;
  due: string;
  assigneeUserId: string;
  contact: { id: string; label: string } | null;
  dealId: string;
}

function fromTask(task: Task | null, contact?: { id: string; label: string }): FormState {
  return {
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    due: toLocalInput(task?.dueAt ?? null),
    assigneeUserId: task?.assigneeUserId ?? "",
    contact: task?.contactId
      ? { id: task.contactId, label: task.contactLabel ?? "Contato" }
      : (contact ?? null),
    dealId: task?.dealId ?? "",
  };
}

/** Criar ou editar tarefa; com contato escolhido, oferece os negocios dele. */
export function TaskDialog({
  tenantId,
  task,
  initialContact,
  open,
  onOpenChange,
}: {
  tenantId: string;
  task: Task | null;
  initialContact?: { id: string; label: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => fromTask(task, initialContact));
  useEffect(() => {
    if (open) setForm(fromTask(task, initialContact));
  }, [open, task, initialContact]);

  const agents = useQuery({
    queryKey: ["inbox-agents", tenantId],
    queryFn: () => inboxApi.agents(tenantId),
    enabled: open,
  });
  const deals = useQuery({
    queryKey: ["deals", tenantId, "contato", form.contact?.id],
    queryFn: () => dealsApi.list(tenantId, { contactId: form.contact!.id }),
    enabled: open && !!form.contact,
  });

  const save = useMutation({
    mutationFn: () => {
      const input = {
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        dueAt: form.due ? new Date(form.due).toISOString() : null,
        assigneeUserId: form.assigneeUserId || null,
        contactId: form.contact?.id ?? null,
        // Sem contato o seletor de negocio some; na edicao, o vinculo fica como esta.
        dealId: form.contact ? form.dealId || null : task ? undefined : null,
      };
      return task ? tasksApi.update(tenantId, task.id, input) : tasksApi.create(tenantId, input);
    },
    onSuccess: () => {
      toast.success(task ? "Tarefa salva" : "Tarefa criada");
      void queryClient.invalidateQueries({ queryKey: ["tasks", tenantId] });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar a tarefa"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>
            No prazo, o responsável recebe um aviso no painel (e por e-mail, se a plataforma tiver).
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.title.trim()) save.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="task-title">O que fazer</Label>
            <Input
              id="task-title"
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="task-due">Prazo</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Select
                value={form.assigneeUserId || NONE}
                onValueChange={(v) => setForm({ ...form, assigneeUserId: v === NONE ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={task?.assigneeEmail ?? "Ninguém"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ninguém</SelectItem>
                  {agents.data?.map((a) => (
                    <SelectItem key={a.userId} value={a.userId}>
                      {a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Contato</Label>
            <ContactPicker
              tenantId={tenantId}
              value={form.contact?.id ?? null}
              label={form.contact?.label ?? null}
              onChange={(contact) => setForm({ ...form, contact, dealId: "" })}
            />
          </div>
          {form.contact && (deals.data?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <Label>Negócio</Label>
              <Select
                value={form.dealId || NONE}
                onValueChange={(v) => setForm({ ...form, dealId: v === NONE ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {deals.data?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="task-notes">Observações</Label>
            <Textarea
              id="task-notes"
              rows={3}
              maxLength={2000}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!form.title.trim() || save.isPending}>
              {task ? "Salvar" : "Criar tarefa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
