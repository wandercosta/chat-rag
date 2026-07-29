import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auditEvents } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria e uso — ChatRAG" },
      { name: "description", content: "Eventos administrativos e de segurança: quem fez o quê e quando." },
      { property: "og:title", content: "Auditoria e uso — ChatRAG" },
      { property: "og:description", content: "Trilha de auditoria filtrável por tipo de evento e período." },
    ],
  }),
  component: AuditPage,
});

// TODO(API): GET /api/tenants/{id}/audit?type=&from=&to=
function AuditPage() {
  const { can } = useSession();
  const [type, setType] = useState("todos");

  if (!can("audit")) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Seu perfil não acessa a auditoria.</Card>;
  }

  const rows = auditEvents.filter((e) => type === "todos" || e.type === type);

  return (
    <>
      <PageHeader title="Auditoria e uso" description="Registro imutável de ações administrativas e de segurança." />
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="grid gap-2">
          <Label>Tipo de evento</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="acesso">Acesso</SelectItem>
              <SelectItem value="configuração">Configuração</SelectItem>
              <SelectItem value="conteúdo">Conteúdo</SelectItem>
              <SelectItem value="segurança">Segurança</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="a-from">Período</Label>
          <div className="flex items-center gap-2">
            <Input id="a-from" type="date" className="w-[160px]" />
            <span className="text-muted-foreground">até</span>
            <Input type="date" className="w-[160px]" />
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quem</TableHead>
              <TableHead>O quê</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Alvo</TableHead>
              <TableHead>Quando</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs">{e.actor}</TableCell>
                <TableCell className="font-medium">{e.action}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {e.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{e.target}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{e.at}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
