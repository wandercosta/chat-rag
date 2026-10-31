import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cannedResponsesApi } from "@/lib/inbox-api";

/** Resposta ao visitante ou nota interna, com respostas prontas. */
export function Composer({
  tenantId,
  conversationId,
  busy,
  onSend,
}: {
  tenantId: string | null;
  conversationId: string;
  busy: boolean;
  onSend: (mode: "reply" | "note", content: string) => Promise<unknown>;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const cannedQuery = useQuery({
    queryKey: ["canned-responses", tenantId],
    queryFn: () => cannedResponsesApi.list(tenantId!),
    enabled: !!tenantId,
  });

  async function send() {
    const content = text.trim();
    if (!content) return;
    try {
      await onSend(mode, content);
      setText("");
    } catch {
      // o toast de erro vem da mutation; o texto fica para tentar de novo.
    }
  }

  return (
    <div className="space-y-2 border-t px-4 py-3" key={conversationId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "reply" | "note")}>
          <TabsList>
            <TabsTrigger value="reply">Responder</TabsTrigger>
            <TabsTrigger value="note">Nota interna</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "reply" && (cannedQuery.data?.length ?? 0) > 0 && (
          <Select
            value=""
            onValueChange={(id) => {
              const chosen = cannedQuery.data?.find((r) => r.id === id);
              if (chosen) setText((t) => (t ? `${t}\n${chosen.content}` : chosen.content));
            }}
          >
            <SelectTrigger className="h-8 w-48" aria-label="Resposta pronta">
              <SelectValue placeholder="Resposta pronta…" />
            </SelectTrigger>
            <SelectContent>
              {cannedQuery.data?.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <Textarea
        rows={3}
        value={text}
        placeholder={
          mode === "reply"
            ? "Escreva a resposta para o visitante… (Ctrl+Enter envia)"
            : "Anotação só para a equipe; o visitante não vê."
        }
        className={mode === "note" ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30" : ""}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" disabled={busy || !text.trim()} onClick={() => void send()}>
          {mode === "reply" ? "Enviar ao visitante" : "Salvar nota"}
        </Button>
      </div>
    </div>
  );
}
