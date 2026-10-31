import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { ConversationView } from "@/components/inbox/conversation-view";
import { CannedResponsesDialog } from "@/components/inbox/canned-responses-dialog";
import { SectorsDialog } from "@/components/inbox/sectors-dialog";
import { useTransferNotice } from "@/components/inbox/transfer-notice";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  inboxApi,
  inboxStatusLabel,
  sectorsApi,
  useInboxEvents,
  type InboxConversation,
  type InboxView,
} from "@/lib/inbox-api";
import { useSession } from "@/lib/session";
import { channelLabel } from "@/lib/channels-api";

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
  const [sectorId, setSectorId] = useState("todos");

  const listQuery = useQuery({
    queryKey: ["inbox", tenantId, view, sectorId],
    queryFn: () => inboxApi.list(tenantId!, view, sectorId === "todos" ? undefined : sectorId),
    enabled: !!tenantId,
  });
  const sectorsQuery = useQuery({
    queryKey: ["inbox-sectors", tenantId],
    queryFn: () => sectorsApi.list(tenantId!),
    enabled: !!tenantId,
  });
  const onTransfer = useTransferNotice(sectorsQuery.data ?? [], setOpenId);

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
  useInboxEvents(tenantId, onChange, onTransfer);

  const rows = listQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Caixa de entrada"
        description="Conversas do widget que pediram atendente. Enquanto uma pessoa atende, o assistente não responde."
        actions={
          profile === "Administrador" ? (
            <div className="flex flex-wrap gap-2">
              <SectorsDialog tenantId={tenantId} />
              <CannedResponsesDialog tenantId={tenantId} />
            </div>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as InboxView)}>
          <TabsList className="flex-wrap">
            {views.map((v) => (
              <TabsTrigger key={v.value} value={v.value}>
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {(sectorsQuery.data?.length ?? 0) > 0 && view !== "assistente" && (
          <Select value={sectorId} onValueChange={setSectorId}>
            <SelectTrigger className="h-9 w-44" aria-label="Setor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os setores</SelectItem>
              {sectorsQuery.data?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

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
  const who =
    c.contact_label ??
    c.visitor_name ??
    c.visitor_email ??
    c.external_user_id ??
    "Visitante anônimo";
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
        {(c.assignment || c.channel !== "widget") && (
          <div className="flex flex-wrap gap-1">
            {c.channel !== "widget" && <Badge variant="secondary">{channelLabel[c.channel]}</Badge>}
            {c.assignment && (
              <Badge variant="outline">{inboxStatusLabel[c.assignment.status]}</Badge>
            )}
            {c.assignment?.sectorName && <Badge variant="outline">{c.assignment.sectorName}</Badge>}
            {c.assignment?.assignedUserEmail && (
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
