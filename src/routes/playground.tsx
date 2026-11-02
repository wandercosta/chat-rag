import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { CitationList } from "@/components/citation-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, assistantsApi, type Citation, type PlaygroundAnswer } from "@/lib/api-client";
import { postStreaming } from "@/lib/sse-stream";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/playground")({
  validateSearch: (s: Record<string, unknown>) => ({ assistente: (s.assistente as string) ?? "" }),
  head: () => ({
    meta: [
      { title: "Playground de conversa — ChatRAG" },
      {
        name: "description",
        content: "Teste um assistente em modo privado antes de publicar no widget.",
      },
      { property: "og:title", content: "Playground de conversa — ChatRAG" },
      { property: "og:description", content: "Ambiente de teste interno dos assistentes." },
    ],
  }),
  component: Playground,
});

interface ChatMessage {
  role: "visitante" | "assistente";
  content: string;
  /** Resposta ainda chegando em pedacos; a final substitui esta. */
  partial?: boolean;
  usedContext?: boolean;
  citations?: Citation[];
}

const GREETING: ChatMessage = {
  role: "assistente",
  content: "Olá! Faça uma pergunta para testar as respostas da base.",
};

function Playground() {
  const { assistente } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { tenantId } = useSession();

  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const assistantsQuery = useQuery({
    queryKey: ["assistants", tenantId],
    queryFn: () => assistantsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const assistants = assistantsQuery.data ?? [];
  const selected = assistente || assistants[0]?.id || "";

  // Cada assistente tem sua propria conversa de teste; trocar de assistente
  // no meio reaproveitaria uma conversa de outro e misturaria o historico.
  useEffect(() => {
    setMessages([GREETING]);
    setConversationId(undefined);
  }, [selected]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = useMutation({
    mutationFn: (message: string) =>
      postStreaming<PlaygroundAnswer>(
        `/organizations/${tenantId}/assistants/${selected}/playground-messages`,
        { message, conversationId, environment: "teste" },
        (delta) =>
          setMessages((m) => {
            const last = m.at(-1);
            return last?.partial
              ? [...m.slice(0, -1), { ...last, content: last.content + delta }]
              : [...m, { role: "assistente", content: delta, partial: true }];
          }),
      ),
    onSuccess: (result) => {
      setConversationId(result.conversationId);
      setMessages((m) => [
        ...m.filter((x) => !x.partial),
        {
          role: "assistente",
          content: result.answer,
          usedContext: result.usedContext,
          citations: result.citations,
        },
      ]);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError && err.status === 409
          ? "Sem chave de IA válida configurada. Vá em Configurações e cadastre uma chave."
          : err instanceof ApiError
            ? err.message
            : "Não foi possível obter a resposta.";
      setMessages((m) => [
        ...m.filter((x) => !x.partial),
        { role: "assistente", content: message },
      ]);
    },
  });

  const submit = () => {
    const text = draft.trim();
    if (!text || !selected || send.isPending) return;
    setMessages((m) => [...m, { role: "visitante", content: text }]);
    setDraft("");
    send.mutate(text);
  };

  const noAssistants = assistantsQuery.isSuccess && assistants.length === 0;

  return (
    <>
      <PageHeader
        title="Playground de conversa"
        description="Ambiente privado de teste. Nada aqui é exposto publicamente."
        actions={
          <Badge
            variant="outline"
            className="h-9 gap-1.5 border-warning/40 bg-warning/12 px-3 text-warning"
          >
            <FlaskConical className="size-3.5" /> Modo teste
          </Badge>
        }
      />
      <ActivationBanner context="playground" />

      {noAssistants ? (
        <Card className="border-dashed p-6 text-sm text-muted-foreground">
          Nenhum assistente cadastrado ainda. Crie um em Assistentes para testar aqui.
        </Card>
      ) : (
        <>
          <div className="max-w-xs">
            <Select value={selected} onValueChange={(v) => navigate({ search: { assistente: v } })}>
              <SelectTrigger aria-label="Assistente">
                <SelectValue placeholder="Selecione um assistente" />
              </SelectTrigger>
              <SelectContent>
                {assistants.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="flex h-[440px] flex-col gap-3 p-4">
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
                {messages.map((m, i) => (
                  <div key={i} className={m.role === "visitante" ? "flex justify-end" : ""}>
                    <div
                      className={
                        m.role === "visitante"
                          ? "w-fit max-w-[75%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                          : "w-fit max-w-[75%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm"
                      }
                    >
                      {m.content}
                      {m.usedContext === false && (
                        <span className="mt-1 block text-xs text-warning">
                          Sem contexto na base
                        </span>
                      )}
                      {m.citations && <CitationList citations={m.citations} />}
                    </div>
                  </div>
                ))}
                {send.isPending && (
                  <div className="w-fit rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    Pensando…
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={draft}
                  disabled={send.isPending || !selected}
                  placeholder="Escreva uma pergunta de teste…"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <Button onClick={submit} disabled={send.isPending || !draft.trim() || !selected}>
                  <Send /> Enviar
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
