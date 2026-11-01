import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireOrgRole, requireSession } from "../identity/index.js";
import { realtime } from "../../realtime/events.js";
import { startSse } from "../../realtime/sse.js";
import {
  TaskForbiddenError,
  TaskInvalidReferenceError,
  TaskNotFoundError,
  tasksService,
} from "./tasks.service.js";

type OrgParams = { Params: { organizationId: string } };
type TaskParams = { Params: { organizationId: string; taskId: string } };

const uuid = z.string().uuid();
const taskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  assigneeUserId: uuid.nullable().optional(),
  contactId: uuid.nullable().optional(),
  dealId: uuid.nullable().optional(),
});
const createSchema = taskSchema.extend({ title: z.string().trim().min(1).max(200) });
const updateSchema = taskSchema.extend({ done: z.boolean().optional() });
const listSchema = z.object({
  view: z.enum(["minhas", "todas"]).default("minhas"),
  status: z.enum(["abertas", "atrasadas", "concluidas"]).default("abertas"),
  contactId: uuid.optional(),
  dealId: uuid.optional(),
});

/** Escrita so de membro: Master em suporte le, mas nao cria tarefa (ADR-008 #5). */
async function requireMember(
  request: FastifyRequest<{ Params: { organizationId?: string } }>,
  reply: FastifyReply,
) {
  const organizationId = request.params?.organizationId;
  if (!request.auth?.memberships.some((m) => m.organizationId === organizationId)) {
    return reply.code(403).send({ error: "so membros da organizacao alteram tarefas" });
  }
}

const canRead = { preHandler: requireOrgRole(["Administrador", "Atendente", "Analista"]) };
const canWrite = { preHandler: [requireOrgRole(["Administrador", "Atendente"]), requireMember] };

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof TaskNotFoundError)
    return reply.code(404).send({ error: "tarefa nao encontrada" });
  if (err instanceof TaskInvalidReferenceError) {
    return reply.code(422).send({ error: `${err.message} invalido para esta organizacao` });
  }
  if (err instanceof TaskForbiddenError) {
    return reply.code(403).send({ error: "so quem criou ou um administrador exclui a tarefa" });
  }
  throw err;
}

export async function tasksRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);
  const base = "/organizations/:organizationId/tasks";

  // "minhas" = do responsavel logado; contato e negocio listam todas as deles.
  app.get<OrgParams>(base, canRead, async (request) => {
    const q = listSchema.parse(request.query);
    const scoped = q.contactId || q.dealId;
    return tasksService.list(request.params.organizationId, {
      status: q.status,
      contactId: q.contactId,
      dealId: q.dealId,
      ...(q.view === "minhas" && !scoped && { assigneeUserId: request.auth!.userId }),
    });
  });

  app.post<OrgParams>(base, canWrite, async (request, reply) => {
    const body = createSchema.parse(request.body);
    try {
      const task = await tasksService.create(request.auth!.userId, request.params.organizationId, {
        ...body,
        // Sem responsavel informado, fica com quem criou.
        assigneeUserId:
          body.assigneeUserId === undefined ? request.auth!.userId : body.assigneeUserId,
      });
      return reply.code(201).send(task);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.patch<TaskParams>(`${base}/:taskId`, canWrite, async (request, reply) => {
    if (!uuid.safeParse(request.params.taskId).success) return reply.code(404).send();
    const body = updateSchema.parse(request.body);
    try {
      return await tasksService.update(
        request.auth!.userId,
        request.params.organizationId,
        request.params.taskId,
        body,
      );
    } catch (err) {
      return handleError(err, reply);
    }
  });

  app.delete<TaskParams>(`${base}/:taskId`, canWrite, async (request, reply) => {
    if (!uuid.safeParse(request.params.taskId).success) return reply.code(404).send();
    const role = request.auth!.memberships.find(
      (m) => m.organizationId === request.params.organizationId,
    )?.role;
    try {
      await tasksService.remove(
        request.auth!.userId,
        request.params.organizationId,
        request.params.taskId,
        role === "Administrador",
      );
      return reply.code(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Lembrete de prazo em tempo real: so o responsavel recebe (so ids).
  app.get<OrgParams>(`${base}/events`, canWrite, async (request, reply) => {
    const me = request.auth!.userId;
    const stream = startSse(request, reply);
    const unsubscribe = await realtime.subscribe(request.params.organizationId, (event) => {
      if (event.kind === "task_due" && event.assigneeUserId === me) {
        stream.send({ kind: event.kind, taskId: event.taskId });
      }
    });
    stream.onClose(unsubscribe);
  });
}
