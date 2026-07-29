import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { knowledgeTopics } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/conhecimento")({
  head: () => ({
    meta: [
      { title: "Base de conhecimento — ChatRAG" },
      { name: "description", content: "Tópicos e fontes da base de conhecimento privada, com status de indexação." },
      { property: "og:title", content: "Base de conhecimento — ChatRAG" },
      { property: "og:description", content: "Gerencie tópicos, fontes e reindexação da base privada." },
    ],
  }),
  component: KnowledgePage,
});

// TODO(API): GET /api/tenants/{id}/topics · POST /api/sources/{id}/reindex
function KnowledgePage() {
  const { can, aiKeyReady } = useSession();
  const [topics] = useState(knowledgeTopics);

  return (
    <>
      <PageHeader
        title="Base de conhecimento"
        description="Tópicos agrupam as fontes que alimentam os assistentes."
        actions={can("write") && <Button onClick={() => toast.info("Nova fonte (simulado)")}>Adicionar fonte</Button>}
      />
      <ActivationBanner context="indexação de fontes" />
      <Accordion type="multiple" defaultValue={[topics[0].id]} className="space-y-3">
        {topics.map((topic) => (
          <AccordionItem key={topic.id} value={topic.id} className="rounded-lg border bg-card px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="text-left">
                <p className="font-medium">{topic.name}</p>
                <p className="text-xs text-muted-foreground">
                  {topic.description} · {topic.sources.length} fontes
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trechos</TableHead>
                    <TableHead>Atualizada</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topic.sources.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell className="text-muted-foreground">{s.kind}</TableCell>
                      <TableCell className="space-x-2">
                        <StatusBadge status={s.status} />
                        {!aiKeyReady && s.status !== "arquivada" && (
                          <span className="text-xs text-warning">aguardando ativação</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{s.chunks}</TableCell>
                      <TableCell className="text-muted-foreground">{s.updatedAt}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!can("write") || !aiKeyReady}
                          onClick={() => toast.success("Reindexação enfileirada (simulado)")}
                        >
                          <RefreshCw /> Reindexar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <Card>
        <CardHeader>
          <CardDescription>Sem chave de IA válida, as fontes permanecem em “aguardando ativação”.</CardDescription>
          <CardTitle className="text-sm font-medium text-muted-foreground">Nota de operação</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          A ordem de processamento é: rascunho → aguardando revisão → na fila → processando → pronta.
        </CardContent>
      </Card>
    </>
  );
}
