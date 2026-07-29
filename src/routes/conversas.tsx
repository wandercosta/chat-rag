import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { assistants, conversations, type Conversation } from "@/lib/mock-data";

export const Route = createFileRoute("/conversas")({
  head: () => ({
    meta: [
      { title: "Conversas — ChatRAG" },
      { name: "description", content: "Histórico filtrável de conversas do widget e do WhatsApp com feedbacks." },
      { property: "og:title", content: "Conversas — ChatRAG" },
      { property: "og:description", content: "Consulte transcrições e feedbacks das conversas." },
    ],
  }),
  component: ConversationsPage,
});

// TODO(API): GET /api/tenants/{id}/conversations?assistant=&visitor=&from=&to=
function ConversationsPage() {
  const [assistant, setAssistant] = useState("todos");
  const [visitor, setVisitor] = useState("");
  const [open, setOpen] = useState<Conversation | null>(null);

  const rows = conversations.filter(
    (c) =>
      (assistant === "todos" || c.assistant === assistant) &&
      c.visitor.toLowerCase().includes(visitor.toLowerCase()),
  );

  return (
    <>
      <PageHeader title="Conversas" description="Transcrições e feedbacks recebidos pelos assistentes." />
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="grid gap-2">
          <Label>Assistente</Label>
          <Select value={assistant} onValueChange={setAssistant}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {assistants.map((a) => (
                <SelectItem key={a.id} value={a.name}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="f-visitor">Visitante</Label>
          <Input id="f-visitor" value={visitor} onChange={(e) => setVisitor(e.target.value)} placeholder="visitante-…" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="f-from">Período</Label>
          <div className="flex items-center gap-2">
            <Input id="f-from" type="date" className="w-[160px]" />
            <span className="text-muted-foreground">até</span>
            <Input type="date" className="w-[160px]" />
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conversa</TableHead>
              <TableHead>Assistente</TableHead>
              <TableHead>Visitante</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Mensagens</TableHead>
              <TableHead>Feedback</TableHead>
              <TableHead>Início</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.id}</TableCell>
                <TableCell>{c.assistant}</TableCell>
                <TableCell className="font-mono text-xs">{c.visitor}</TableCell>
                <TableCell className="text-muted-foreground">{c.channel}</TableCell>
                <TableCell className="tabular-nums">{c.messages}</TableCell>
                <TableCell>
                  <StatusBadge status={c.feedback} />
                </TableCell>
                <TableCell className="text-muted-foreground">{c.startedAt}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(c)}>
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Conversa {open?.id}</SheetTitle>
            <SheetDescription>
              {open?.assistant} · {open?.visitor} · feedback: {open?.feedback}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-6">
            {open?.transcript.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "visitante"
                    ? "ml-auto w-fit max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "w-fit max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm"
                }
              >
                <p>{m.content}</p>
                <p className="mt-1 text-[10px] opacity-70">{m.at}</p>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
