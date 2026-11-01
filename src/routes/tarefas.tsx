import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tasksApi, type Task, type TaskStatus } from "@/lib/tasks-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/tarefas")({
  head: () => ({
    meta: [
      { title: "Tarefas — ChatRAG" },
      {
        name: "description",
        content: "Tarefas com prazo e responsável, ligadas a contatos e negócios.",
      },
      { property: "og:title", content: "Tarefas — ChatRAG" },
      {
        property: "og:description",
        content: "O que cada pessoa da equipe precisa fazer e até quando.",
      },
    ],
  }),
  component: TasksPage,
});

const statuses: { value: TaskStatus; label: string }[] = [
  { value: "abertas", label: "Abertas" },
  { value: "atrasadas", label: "Atrasadas" },
  { value: "concluidas", label: "Concluídas" },
];

function TasksPage() {
  const { tenantId, userId, can, profile } = useSession();
  const [view, setView] = useState<"minhas" | "todas">("minhas");
  const [status, setStatus] = useState<TaskStatus>("abertas");
  const [dialog, setDialog] = useState<{ task: Task | null } | null>(null);
  const canWrite = can("tasks_write");

  const query = useQuery({
    queryKey: ["tasks", tenantId, view, status],
    queryFn: () => tasksApi.list(tenantId!, { view, status }),
    enabled: !!tenantId,
  });
  const tasks = query.data ?? [];

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="No prazo, o responsável recebe um aviso no painel. Tarefas ligadas a um contato aparecem também na página dele."
        actions={
          canWrite && (
            <Button size="sm" onClick={() => setDialog({ task: null })}>
              <Plus /> Nova tarefa
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as "minhas" | "todas")}>
          <TabsList>
            <TabsTrigger value="minhas">Minhas</TabsTrigger>
            <TabsTrigger value="todas">Da equipe</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
          <TabsList>
            {statuses.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <Card>
        <CardContent className="pt-4">
          {!tenantId && (
            <p className="text-sm text-muted-foreground">As tarefas são de cada organização.</p>
          )}
          {query.isSuccess && tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa aqui.</p>
          )}
          {tenantId && (
            <TaskList
              tenantId={tenantId}
              tasks={tasks}
              canWrite={canWrite}
              canDelete={(t) => canWrite && (profile === "Administrador" || t.createdBy === userId)}
              onOpen={(task) => setDialog({ task })}
            />
          )}
        </CardContent>
      </Card>
      {tenantId && canWrite && (
        <TaskDialog
          tenantId={tenantId}
          task={dialog?.task ?? null}
          open={!!dialog}
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}
    </>
  );
}
