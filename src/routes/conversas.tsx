import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assistantsApi, conversationsApi } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/conversas")({
  head: () => ({
    meta: [
      { title: "Conversas — ChatRAG" },
      {
        name: "description",
        content: "Histórico filtrável de conversas do widget e do WhatsApp com feedbacks.",
      },
      { property: "og:title", content: "Conversas — ChatRAG" },
      { property: "og:description", content: "Consulte transcrições e feedbacks das conversas." },
    ],
  }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const { tenantId } = useSession();
  const [assistantFilter, setAssistantFilter] = useState("todos");
  const [openId, setOpenId] = useState<string | null>(null);

  const assistantsQuery = useQuery({
    queryKey: ["assistants", tenantId],
    queryFn: () => assistantsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const conversationsQuery = useQuery({
    queryKey: ["conversations", tenantId],
    queryFn: () => conversationsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const assistantNames = new Map((assistantsQuery.data ?? []).map((a) => [a.id, a.name]));
  const all = conversationsQuery.data ?? [];
  const rows =
    assistantFilter === "todos" ? all : all.filter((c) => c.assistant_id === assistantFilter);

  return (
    <>
      <PageHeader title="Conversas" description="Transcrições recebidas pelos assistentes." />

      <div className="max-w-xs">
        <Select value={assistantFilter} onValueChange={setAssistantFilter}>
          <SelectTrigger aria-label="Assistente">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os assistentes</SelectItem>
            {assistantsQuery.data?.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden p-0">
        {conversationsQuery.isLoading && (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        )}
        {conversationsQuery.isSuccess && rows.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma conversa registrada ainda.</p>
        )}
        {rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conversa</TableHead>
                <TableHead>Assistente</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Início</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.id.slice(0, 8)}</TableCell>
                  <TableCell>{assistantNames.get(c.assistant_id) ?? c.assistant_id}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {c.channel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(c.started_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(c.id)}>
                      Abrir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <TranscriptSheet
        tenantId={tenantId}
        conversationId={openId}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function TranscriptSheet({
  tenantId,
  conversationId,
  onClose,
}: {
  tenantId: string | null;
  conversationId: string | null;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["conversation", tenantId, conversationId],
    queryFn: () => conversationsApi.get(tenantId!, conversationId!),
    enabled: !!tenantId && !!conversationId,
  });

  return (
    <Sheet open={!!conversationId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Transcrição</SheetTitle>
          <SheetDescription>Mensagens trocadas nesta conversa.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 max-h-[80vh] space-y-3 overflow-y-auto pr-1">
          {detailQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {detailQuery.data?.messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Conversa sem mensagens.</p>
          )}
          {detailQuery.data?.messages.map((m) => (
            <div key={m.id} className={m.role === "visitante" ? "flex justify-end" : ""}>
              <div
                className={
                  m.role === "visitante"
                    ? "w-fit max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "w-fit max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
