import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTaskReminders } from "@/lib/tasks-api";
import { useSession } from "@/lib/session";

/**
 * Fica no layout do painel: quando uma tarefa do usuario vence, mostra um
 * aviso com atalho para a lista, em qualquer tela.
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

  useTaskReminders(enabled ? tenantId : null, onDue);
  return null;
}
