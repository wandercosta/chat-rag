import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError } from "@/lib/api-client";
import { formatDue, tasksApi, type Task } from "@/lib/tasks-api";

/** Linhas de tarefa: concluir com a caixa, abrir pelo titulo, excluir. */
export function TaskList({
  tenantId,
  tasks,
  canWrite,
  canDelete,
  onOpen,
  showLinks = true,
}: {
  tenantId: string;
  tasks: Task[];
  canWrite: boolean;
  canDelete: (task: Task) => boolean;
  onOpen: (task: Task) => void;
  showLinks?: boolean;
}) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["tasks", tenantId] });
  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar a tarefa");

  const toggle = useMutation({
    mutationFn: (task: Task) => tasksApi.update(tenantId, task.id, { done: !task.doneAt }),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (task: Task) => tasksApi.remove(tenantId, task.id),
    onSuccess: refresh,
    onError: fail,
  });

  return (
    <ul className="divide-y text-sm">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-start gap-3 py-2">
          <Checkbox
            className="mt-0.5"
            checked={!!task.doneAt}
            disabled={!canWrite || toggle.isPending}
            aria-label={task.doneAt ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
            onCheckedChange={() => toggle.mutate(task)}
          />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className={`text-left font-medium hover:underline ${task.doneAt ? "text-muted-foreground line-through" : ""}`}
              onClick={() => onOpen(task)}
            >
              {task.title}
            </button>
            <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span className={task.overdue ? "font-medium text-destructive" : ""}>
                {task.overdue ? "atrasada · " : ""}
                {formatDue(task.dueAt)}
              </span>
              {task.assigneeEmail && <span>{task.assigneeEmail.split("@")[0]}</span>}
              {showLinks && task.contactId && (
                <Link
                  to="/contatos/$contactId"
                  params={{ contactId: task.contactId }}
                  className="hover:underline"
                >
                  {task.contactLabel ?? "contato"}
                </Link>
              )}
              {showLinks && task.dealId && (
                <Link to="/funil" search={{ negocio: task.dealId }} className="hover:underline">
                  {task.dealTitle ?? "negócio"}
                </Link>
              )}
            </p>
          </div>
          {canDelete(task) && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={`Excluir ${task.title}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(task)}
            >
              <Trash2 />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
