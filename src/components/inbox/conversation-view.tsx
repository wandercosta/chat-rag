import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { channelLabel } from "@/lib/channels-api";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { TransferDialog } from "./transfer-dialog";
import { TemplateComposer } from "./template-composer";
import { ConversationContact } from "./save-contact-dialog";

type TimelineItem =
  | { kind: "message"; at: string; item: InboxConversationDetail["messages"][number] }
  | { kind: "note"; at: string; item: InboxConversationDetail["notes"][number] };

function lastVisitorAt(detail: InboxConversationDetail) {
  const last = detail.messages.filter((m) => m.role === "visitante").at(-1);
  return last ? new Date(last.created_at).getTime() : 0;
}

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
  // Messenger/Instagram com a janela ainda aberta depois de 24 horas: so pode
  // ser a tag "Agente humano" (7 dias), e o envio sai com ela.
  const humanAgentTag =
    !windowClosed &&
    (detail.channel === "messenger" || detail.channel === "instagram") &&
    lastVisitorAt(detail) < Date.now() - 24 * 60 * 60 * 1000;

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
        {assignment?.sectorName && <Badge variant="secondary">{assignment.sectorName}</Badge>}

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

            {(isAdmin || isMine || !assignment?.assignedUserId) && (
              <TransferDialog
                tenantId={tenantId!}
                conversationId={detail.id}
                currentSectorId={assignment?.sectorId ?? null}
                onDone={() =>
                  void queryClient.invalidateQueries({
                    queryKey: ["inbox-conversation", tenantId, conversationId],
                  })
                }
              />
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
                Nota interna · {entry.item.author_email ?? "automação"} · o visitante não vê
              </p>
              <p className="whitespace-pre-wrap">{entry.item.content}</p>
            </div>
          ) : (
            <MessageBubble
              key={`m-${entry.item.id}`}
              message={entry.item}
              organizationId={tenantId!}
              conversationId={conversationId}
            />
          ),
        )}
      </div>

      {replyable && windowClosed && detail.channel !== "whatsapp" && (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Passou o prazo de resposta desde a última mensagem do cliente. Pelo{" "}
          {channelLabel[detail.channel]}, a resposta só volta a ser possível quando ele escrever de
          novo.
        </p>
      )}
      {replyable && humanAgentTag && (
        <p className="border-t px-4 pt-3 text-xs text-muted-foreground">
          Mais de 24 horas sem mensagem do cliente: a resposta sai com a tag “Agente humano” da
          Meta, aceita até {new Date(detail.replyWindowEndsAt!).toLocaleString("pt-BR")}.
        </p>
      )}
      {replyable &&
        windowClosed &&
        detail.channel === "whatsapp" &&
        detail.channel_connection_id && (
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
