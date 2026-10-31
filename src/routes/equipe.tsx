import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { MessagePane } from "@/components/team-chat/message-pane";
import { ThreadList, threadTitle } from "@/components/team-chat/thread-list";
import { Card } from "@/components/ui/card";
import { teamChatApi, useTeamChatEvents } from "@/lib/team-chat-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Chat da equipe — ChatRAG" },
      {
        name: "description",
        content:
          "Conversa interna entre as pessoas da organização: canal Geral e mensagens diretas.",
      },
      { property: "og:title", content: "Chat da equipe — ChatRAG" },
      {
        property: "og:description",
        content: "Canal Geral e mensagens diretas entre quem usa o painel da organização.",
      },
    ],
  }),
  component: TeamChatPage,
});

function TeamChatPage() {
  const { tenantId, userId } = useSession();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const threadsQuery = useQuery({
    queryKey: ["team-chat-threads", tenantId],
    queryFn: () => teamChatApi.threads(tenantId!),
    enabled: !!tenantId,
  });
  const threads = threadsQuery.data ?? [];
  const activeId = openId ?? threads[0]?.id ?? null;
  const active = threads.find((t) => t.id === activeId);

  const onMessage = useCallback(
    ({ threadId }: { threadId: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["team-chat-threads", tenantId] });
      void queryClient.invalidateQueries({
        queryKey: ["team-chat-messages", tenantId, threadId],
      });
    },
    [queryClient, tenantId],
  );
  useTeamChatEvents(tenantId, onMessage);

  return (
    <>
      <PageHeader
        title="Chat da equipe"
        description="Conversa interna entre as pessoas da organização. Nada daqui vai para clientes nem para o assistente."
      />
      {!tenantId ? (
        <Card className="p-6 text-sm text-muted-foreground">
          O chat da equipe é só para quem faz parte de uma organização.
        </Card>
      ) : (
        <Card className="grid h-[70vh] grid-cols-1 overflow-hidden p-0 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="min-h-0 border-b md:border-b-0 md:border-r">
            <ThreadList
              tenantId={tenantId}
              threads={threads}
              activeId={activeId}
              onOpen={(id) => {
                setOpenId(id);
                void queryClient.invalidateQueries({ queryKey: ["team-chat-threads", tenantId] });
              }}
            />
          </div>
          <div className="min-h-0">
            {activeId ? (
              <MessagePane
                key={activeId}
                tenantId={tenantId}
                threadId={activeId}
                title={active ? threadTitle(active) : ""}
                me={userId}
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
