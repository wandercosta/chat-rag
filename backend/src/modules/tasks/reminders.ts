import { mailer, panelLink } from "../../mail/mailer.js";
import { realtime } from "../../realtime/events.js";
import { membersService } from "../identity/index.js";
import { tasksRepository } from "./tasks.repository.js";

/**
 * Varredura do worker (a cada minuto): tarefa vencida e ainda aberta avisa o
 * responsavel uma vez, no painel (tempo real) e por e-mail se houver SMTP.
 * O e-mail nao leva titulo nem contato (minimizacao): so o aviso e o link.
 */
export async function remindDueTasks() {
  const due = await tasksRepository.claimDue();
  for (const task of due) {
    if (!task.assignee_user_id) continue;
    await realtime.publish(task.organization_id, {
      kind: "task_due",
      taskId: task.id,
      assigneeUserId: task.assignee_user_id,
    });
    if (!mailer.enabled()) continue;
    try {
      const members = await membersService.list(task.organization_id);
      const to = members.find((m) => m.user_id === task.assignee_user_id)?.email;
      if (!to) continue;
      await mailer.send({
        to,
        subject: "Uma tarefa sua venceu",
        text: [
          "Chegou o prazo de uma tarefa sua no painel.",
          "",
          `Ver tarefas: ${panelLink("/tarefas")}`,
        ].join("\n"),
      });
    } catch (err) {
      // Melhor esforco: o aviso no painel ja saiu.
      console.error("falha ao enviar lembrete de tarefa:", (err as Error).message);
    }
  }
  return due.length;
}
