import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Hash, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { displayName, teamChatApi, type TeamThread } from "@/lib/team-chat-api";

export function threadTitle(t: TeamThread) {
  return t.kind === "geral" ? "Geral" : displayName(t.otherEmail);
}

/** Canal Geral, conversas diretas e o seletor para falar com alguem. */
export function ThreadList({
  tenantId,
  threads,
  activeId,
  onOpen,
}: {
  tenantId: string;
  threads: TeamThread[];
  activeId: string | null;
  onOpen: (threadId: string) => void;
}) {
  const [picker, setPicker] = useState("");
  const peopleQuery = useQuery({
    queryKey: ["team-chat-people", tenantId],
    queryFn: () => teamChatApi.people(tenantId),
  });
  const open = useMutation({
    mutationFn: (userId: string) => teamChatApi.openDirect(tenantId, userId),
    onSuccess: (thread) => onOpen(thread.id),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível abrir a conversa"),
    onSettled: () => setPicker(""),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <Select
          value={picker}
          onValueChange={(userId) => {
            setPicker(userId);
            open.mutate(userId);
          }}
        >
          <SelectTrigger className="h-9" aria-label="Conversar com">
            <SelectValue placeholder="Conversar com…" />
          </SelectTrigger>
          <SelectContent>
            {peopleQuery.data?.map((p) => (
              <SelectItem key={p.userId} value={p.userId}>
                {p.email} · {p.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ul className="flex-1 divide-y overflow-y-auto">
        {threads.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className={`flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-muted/60 ${
                t.id === activeId ? "bg-muted" : ""
              }`}
            >
              {t.kind === "geral" ? (
                <Hash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              ) : (
                <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{threadTitle(t)}</span>
                  {t.unread > 0 && <Badge className="shrink-0">{t.unread}</Badge>}
                </span>
                {t.lastMessage && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.kind === "geral" && `${displayName(t.lastAuthorEmail)}: `}
                    {t.lastMessage}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
