import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CitationList } from "@/components/citation-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, membersApi } from "@/lib/api-client";
import {
  inboxApi,
  inboxStatusLabel,
  type InboxConversationDetail,
  type InboxStatus,
} from "@/lib/inbox-api";
import { useSession } from "@/lib/session";
import { deliveryLabel } from "@/lib/channels-api";
import { Composer } from "./composer";
import { TemplateComposer } from "./template-composer";
import { ConversationContact } from "./save-contact-dialog";

type TimelineItem =
  | { kind: "message"; at: string; item: InboxConversationDetail["messages"][number] }
  | { kind: "note"; at: string; item: InboxConversationDetail["notes"][number] };

/** Mensagens e notas internas na ordem em que aconteceram. */
function timelineOf(detail: InboxConversationDetail): TimelineItem[] {
  return [
    ...detail.messages.map((m) => ({ kind: "message" as const, at: m.created_at, item: m })),
    ...detail.notes.map((n) => ({ kind: "note" as const, at: n.created_at, item: n })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));
}

export function ConversationView({
  tenantId,
  conversationId,
}: {
  tenantId: string | null;
  conversationId: string;
}) {
  const { userId, profile, can } = useSession();
  const queryClient = useQueryClient();
  const canAct = can("inbox_reply");
  const isAdmin = profile === "Administrador";

  const detailQuery = useQuery({
    queryKey: ["inbox-conversation", tenantId, conversationId],
    queryFn: () => inboxApi.get(tenantId!, conversationId),
    enabled: !!tenantId,
  });
  const membersQuery = useQuery({
    queryKey: ["members", tenantId],
    queryFn: () => membersApi.list(tenantId!),
    enabled: !!tenantId && isAdmin,
  });

  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inbox", tenantId] });
      void queryClient.invalidateQueries({
        queryKey: ["inbox-conversation", tenantId, conversationId],
      });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir a ação");
    },
  });

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        {detailQuery.isError ? "Não foi possível abrir a conversa." : "Carregando…"}
      </Card>
    );
  }

  const assignment = detail.assignment;
  const isMine = assignment?.assignedUserId === userId;
  const agents = (membersQuery.data ?? []).filter(
    (m) => m.role === "Administrador" || m.role === "Atendente",
  );
  const replyable = canAct && detail.channel !== "playground";
  // WhatsApp depois de 24 horas sem mensagem do cliente: so modelo aprovado.
  const windowClosed =
    !!detail.replyWindowEndsAt && new Date(detail.replyWindowEndsAt).getTime() < Date.now();

  return (
    <Card className="flex max-h-[70vh] flex-col overflow-hidden p-0">
      <ConversationContact
        tenantId={tenantId}
        conversationId={detail.id}
        contactId={detail.contact_id}
        contactLabel={detail.contact_label}
      />
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <Badge variant="outline">
          {assignment ? inboxStatusLabel[assignment.status] : "Com o assistente"}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {assignment?.assignedUserEmail ?? "Sem responsável"}
        </span>

        {replyable && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {isMine ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => action.mutate(() => inboxApi.assign(tenantId!, detail.id, null))}
              >
                Devolver à fila
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => action.mutate(() => inboxApi.assign(tenantId!, detail.id, userId))}
              >
                Assumir
              </Button>
            )}

            {isAdmin && agents.length > 0 && (
              <Select
                value={assignment?.assignedUserId ?? ""}
                onValueChange={(id) =>
                  action.mutate(() => inboxApi.assign(tenantId!, detail.id, id))
                }
              >
                <SelectTrigger className="h-8 w-44" aria-label="Atribuir a">
                  <SelectValue placeholder="Atribuir a…" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={assignment?.status ?? ""}
              onValueChange={(status) =>
                action.mutate(() => inboxApi.setStatus(tenantId!, detail.id, status as InboxStatus))
              }
            >
              <SelectTrigger className="h-8 w-44" aria-label="Status">
                <SelectValue placeholder="Mudar status…" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(inboxStatusLabel) as InboxStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {inboxStatusLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {timelineOf(detail).map((entry) =>
          entry.kind === "note" ? (
            <div
              key={`n-${entry.item.id}`}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <p className="mb-1 text-xs font-medium">
                Nota interna · {entry.item.author_email ?? "removido"} · o visitante não vê
              </p>
              <p className="whitespace-pre-wrap">{entry.item.content}</p>
            </div>
          ) : (
            <MessageBubble key={`m-${entry.item.id}`} message={entry.item} />
          ),
        )}
      </div>

      {replyable && windowClosed && detail.channel_connection_id && (
        <TemplateComposer
          tenantId={tenantId}
          conversationId={detail.id}
          connectionId={detail.channel_connection_id}
          onSent={() =>
            void queryClient.invalidateQueries({
              queryKey: ["inbox-conversation", tenantId, conversationId],
            })
          }
        />
      )}
      {replyable && !windowClosed && (
        <Composer
          tenantId={tenantId}
          conversationId={detail.id}
          busy={action.isPending}
          onSend={(mode, content) =>
            action.mutateAsync(() =>
              mode === "reply"
                ? inboxApi.reply(tenantId!, detail.id, content)
                : inboxApi.addNote(tenantId!, detail.id, content),
            )
          }
        />
      )}
    </Card>
  );
}

function MessageBubble({ message: m }: { message: InboxConversationDetail["messages"][number] }) {
  const ours = m.role !== "visitante";
  const label =
    m.role === "visitante"
      ? "Visitante"
      : m.role === "assistente"
        ? "Assistente"
        : (m.author_email ?? "Atendente");
  return (
    <div className={ours ? "flex flex-col items-end" : "flex flex-col items-start"}>
      <span className="mb-0.5 text-xs text-muted-foreground">{label}</span>
      <div
        className={
          m.role === "atendente"
            ? "w-fit max-w-[80%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
            : m.role === "assistente"
              ? "w-fit max-w-[80%] whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm"
              : "w-fit max-w-[80%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm"
        }
      >
        {m.content}
        {m.citations?.length ? <CitationList citations={m.citations} /> : null}
      </div>
      {m.delivery_status && (
        <span
          className={`mt-0.5 text-[11px] ${m.delivery_status === "falhou" ? "text-destructive" : "text-muted-foreground"}`}
          title={m.delivery_error ?? undefined}
        >
          {deliveryLabel[m.delivery_status]}
          {m.delivery_error ? `: ${m.delivery_error}` : ""}
        </span>
      )}
    </div>
  );
}
