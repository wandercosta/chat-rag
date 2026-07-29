import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FlaskConical, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assistants } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/playground")({
  validateSearch: (s: Record<string, unknown>) => ({ assistente: (s.assistente as string) ?? assistants[0].id }),
  head: () => ({
    meta: [
      { title: "Playground de conversa — ChatRAG" },
      { name: "description", content: "Teste um assistente em modo privado antes de publicar no widget." },
      { property: "og:title", content: "Playground de conversa — ChatRAG" },
      { property: "og:description", content: "Ambiente de teste interno dos assistentes." },
    ],
  }),
  component: Playground,
});

// TODO(API): POST /api/assistants/{id}/playground-messages
function Playground() {
  const { assistente } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { aiKeyReady } = useSession();
  const [messages, setMessages] = useState<{ role: "visitante" | "assistente"; content: string }[]>([
    { role: "assistente", content: "Olá! Faça uma pergunta para testar as respostas da base." },
  ]);
  const [draft, setDraft] = useState("");

  const send = () => {
    if (!draft.trim()) return;
    setMessages((m) => [
      ...m,
      { role: "visitante", content: draft.trim() },
      { role: "assistente", content: "Resposta simulada — a geração real virá da API de RAG." },
    ]);
    setDraft("");
  };

  return (
    <>
      <PageHeader
        title="Playground de conversa"
        description="Ambiente privado de teste. Nada aqui é exposto publicamente."
        actions={
          <Badge variant="outline" className="h-9 gap-1.5 border-warning/40 bg-warning/12 px-3 text-warning">
            <FlaskConical className="size-3.5" /> Modo teste
          </Badge>
        }
      />
      <ActivationBanner context="playground" />
      <div className="max-w-xs">
        <Select value={assistente} onValueChange={(v) => navigate({ search: { assistente: v } })}>
          <SelectTrigger aria-label="Assistente">
            <SelectValue />
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
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "visitante"
                    ? "ml-auto w-fit max-w-[75%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "w-fit max-w-[75%] rounded-lg bg-muted px-3 py-2 text-sm"
                }
              >
                {m.content}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={draft}
              disabled={!aiKeyReady}
              placeholder={aiKeyReady ? "Escreva uma pergunta de teste…" : "Indisponível até configurar a chave de IA"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <Button onClick={send} disabled={!aiKeyReady}>
              <Send /> Enviar
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
