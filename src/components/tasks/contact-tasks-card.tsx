import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tasksApi, type Task } from "@/lib/tasks-api";
import { useSession } from "@/lib/session";
import { TaskDialog } from "./task-dialog";
import { TaskList } from "./task-list";

/** Tarefas abertas do contato, com atalho para criar (ADR-008 #4). */
export function ContactTasksCard({
  tenantId,
  contactId,
  contactLabel,
}: {
  tenantId: string;
  contactId: string;
  contactLabel: string;
}) {
  const { can, profile, userId } = useSession();
  const [dialog, setDialog] = useState<{ task: Task | null } | null>(null);
  const canWrite = can("tasks_write");
  const query = useQuery({
    queryKey: ["tasks", tenantId, "contato", contactId],
    queryFn: () => tasksApi.list(tenantId, { contactId, status: "abertas" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Tarefas</CardTitle>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={() => setDialog({ task: null })}>
            <Plus /> Nova
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {query.isSuccess && query.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma tarefa aberta.</p>
        )}
        <TaskList
          tenantId={tenantId}
          tasks={query.data ?? []}
          canWrite={canWrite}
          canDelete={(t) => canWrite && (profile === "Administrador" || t.createdBy === userId)}
          onOpen={(task) => setDialog({ task })}
          showLinks={false}
        />
      </CardContent>
      {canWrite && (
        <TaskDialog
          tenantId={tenantId}
          task={dialog?.task ?? null}
          initialContact={{ id: contactId, label: contactLabel }}
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}
    </Card>
  );
}
