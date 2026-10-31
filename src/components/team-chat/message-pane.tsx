import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { displayName, teamChatApi, type TeamMessage } from "@/lib/team-chat-api";

const time = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function Bubble({ message, mine }: { message: TeamMessage; mine: boolean }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          mine ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {!mine && <p className="text-xs font-medium">{displayName(message.authorEmail)}</p>}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className={`mt-1 text-[10px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
          {time(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

/** Mensagens da thread aberta e a caixa de texto (Enter envia, Shift+Enter quebra linha). */
export function MessagePane({
  tenantId,
  threadId,
  title,
  me,
}: {
  tenantId: string;
  threadId: string;
  title: string;
  me: string | null;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ["team-chat-messages", tenantId, threadId],
    queryFn: () => teamChatApi.messages(tenantId, threadId),
  });
  const messages = query.data ?? [];

  // Abrir a thread marca como lida no servidor: a lista atualiza o contador.
  useEffect(() => {
    if (query.isSuccess) {
      void queryClient.invalidateQueries({ queryKey: ["team-chat-threads", tenantId] });
    }
  }, [query.isSuccess, query.dataUpdatedAt, queryClient, tenantId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, threadId]);

  const send = useMutation({
    mutationFn: (content: string) => teamChatApi.send(tenantId, threadId, content),
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["team-chat-messages", tenantId, threadId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível enviar a mensagem"),
  });
  const submit = () => {
    const content = text.trim();
    if (content && !send.isPending) send.mutate(content);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3 text-sm font-medium">{title}</div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {query.isSuccess && messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda. Escreva a primeira.
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} mine={m.authorUserId === me} />
        ))}
        <div ref={bottom} />
      </div>
      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          rows={2}
          maxLength={4000}
          placeholder="Mensagem para a equipe…"
          aria-label="Mensagem"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          size="icon"
          aria-label="Enviar"
          disabled={!text.trim() || send.isPending}
          onClick={submit}
        >
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}
