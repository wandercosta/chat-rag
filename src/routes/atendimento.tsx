import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { ConversationView } from "@/components/inbox/conversation-view";
import { CannedResponsesDialog } from "@/components/inbox/canned-responses-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  inboxApi,
  inboxStatusLabel,
  useInboxEvents,
  type InboxConversation,
  type InboxView,
} from "@/lib/inbox-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/atendimento")({
  head: () => ({
    meta: [
      { title: "Caixa de entrada — ChatRAG" },
      {
        name: "description",
        content: "Conversas que pediram atendente, com atribuição, notas internas e tempo real.",
      },
      { property: "og:title", content: "Caixa de entrada — ChatRAG" },
      {
        property: "og:description",
        content: "Atenda no painel as conversas que o assistente passou para um humano.",
      },
    ],
  }),
  component: InboxPage,
});

const views: { value: InboxView; label: string }[] = [
  { value: "fila", label: "Aguardando" },
  { value: "minhas", label: "Minhas" },
  { value: "abertas", label: "Todas abertas" },
  { value: "resolvidas", label: "Resolvidas" },
  { value: "assistente", label: "Com o assistente" },
];

function InboxPage() {
  const { tenantId, profile } = useSession();
  const queryClient = useQueryClient();
  const [view, setView] = useState<InboxView>("fila");
  const [openId, setOpenId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["inbox", tenantId, view],
    queryFn: () => inboxApi.list(tenantId!, view),
    enabled: !!tenantId,
  });

  // Qualquer mudanca numa conversa recarrega a fila e, se for a aberta, o detalhe.
  const onChange = useCallback(
    (conversationId: string) => {
      void queryClient.invalidateQueries({ queryKey: ["inbox", tenantId] });
      void queryClient.invalidateQueries({
        queryKey: ["inbox-conversation", tenantId, conversationId],
      });
    },
    [queryClient, tenantId],
  );
  useInboxEvents(tenantId, onChange);

  const rows = listQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Caixa de entrada"
        description="Conversas do widget que pediram atendente. Enquanto uma pessoa atende, o assistente não responde."
        actions={profile === "Administrador" ? <CannedResponsesDialog tenantId={tenantId} /> : null}
      />

      <Tabs value={view} onValueChange={(v) => setView(v as InboxView)}>
        <TabsList className="flex-wrap">
          {views.map((v) => (
            <TabsTrigger key={v.value} value={v.value}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="max-h-[70vh] overflow-y-auto p-0">
          {listQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
          {listQuery.isSuccess && rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa aqui.</p>
          )}
          <ul className="divide-y">
            {rows.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === openId}
                onOpen={() => setOpenId(c.id)}
              />
            ))}
          </ul>
        </Card>

        {openId ? (
          <ConversationView tenantId={tenantId} conversationId={openId} />
        ) : (
          <Card className="flex min-h-64 items-center justify-center p-6 text-sm text-muted-foreground">
            Escolha uma conversa para ver as mensagens.
          </Card>
        )}
      </div>
    </>
  );
}

function ConversationRow({
  conversation: c,
  active,
  onOpen,
}: {
  conversation: InboxConversation;
  active: boolean;
  onOpen: () => void;
}) {
  const who = c.visitor_name ?? c.visitor_email ?? c.external_user_id ?? "Visitante anônimo";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`w-full space-y-1 px-4 py-3 text-left hover:bg-muted/60 ${active ? "bg-muted" : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{who}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(c.last_activity_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {c.last_message?.content ?? "Sem mensagens ainda."}
        </p>
        {c.assignment && (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">{inboxStatusLabel[c.assignment.status]}</Badge>
            {c.assignment.assignedUserEmail && (
              <Badge variant="secondary" className="max-w-full truncate">
                {c.assignment.assignedUserEmail}
              </Badge>
            )}
          </div>
        )}
      </button>
    </li>
  );
}
