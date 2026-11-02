import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tasksApi, useTaskReminders } from "@/lib/tasks-api";
import { useSession } from "@/lib/session";

/**
 * Fica no layout do painel: quando uma tarefa do usuario vence, mostra um
 * aviso com atalho para a lista, em qualquer tela. O aviso em tempo real so
 * chega a quem esta com o painel aberto; ao abrir, lembra as que ja venceram.
 */
export function TaskReminders() {
  const { tenantId, can } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enabled = can("tasks_write");

  const onDue = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tasks", tenantId] });
    toast.warning("Uma tarefa sua venceu", {
      action: { label: "Ver tarefas", onClick: () => void navigate({ to: "/tarefas" }) },
      duration: 15_000,
    });
  }, [navigate, queryClient, tenantId]);

  useEffect(() => {
    if (!enabled || !tenantId) return;
    let cancelled = false;
    tasksApi
      .list(tenantId, { view: "minhas", status: "atrasadas" })
      .then((tasks) => {
        if (cancelled || tasks.length === 0) return;
        toast.warning(
          tasks.length === 1
            ? "Você tem 1 tarefa atrasada"
            : `Você tem ${tasks.length} tarefas atrasadas`,
          {
            action: { label: "Ver tarefas", onClick: () => void navigate({ to: "/tarefas" }) },
            duration: 15_000,
          },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, tenantId, navigate]);

  useTaskReminders(enabled ? tenantId : null, onDue);
  return null;
}
