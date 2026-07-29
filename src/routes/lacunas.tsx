import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gaps as seed } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/lacunas")({
  head: () => ({
    meta: [
      { title: "Lacunas e feedbacks — ChatRAG" },
      { name: "description", content: "Perguntas sem resposta na base, frequência e status de resolução." },
      { property: "og:title", content: "Lacunas e feedbacks — ChatRAG" },
      { property: "og:description", content: "Priorize o que falta na base de conhecimento." },
    ],
  }),
  component: GapsPage,
});

// TODO(API): GET /api/tenants/{id}/gaps · PATCH /api/gaps/{id}
function GapsPage() {
  const { profile } = useSession();
  const readOnly = profile === "Analista";
  const [rows, setRows] = useState(seed);

  return (
    <>
      <PageHeader title="Lacunas e feedbacks" description="Perguntas que a base atual não respondeu." />
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pergunta</TableHead>
              <TableHead>Frequência</TableHead>
              <TableHead>Assistente</TableHead>
              <TableHead>Última ocorrência</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="max-w-md font-medium">{g.question}</TableCell>
                <TableCell className="tabular-nums">{g.frequency}</TableCell>
                <TableCell className="text-muted-foreground">{g.assistant}</TableCell>
                <TableCell className="text-muted-foreground">{g.lastSeen}</TableCell>
                <TableCell>
                  <StatusBadge status={g.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={readOnly || g.status === "resolvida"}
                    onClick={() => {
                      setRows((r) => r.map((x) => (x.id === g.id ? { ...x, status: "resolvida" as const } : x)));
                      toast.success("Lacuna marcada como resolvida (simulado)");
                    }}
                  >
                    <Check /> Marcar resolvida
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
