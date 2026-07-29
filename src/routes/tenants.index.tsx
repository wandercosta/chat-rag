import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { tenants } from "@/lib/mock-data";

export const Route = createFileRoute("/tenants")({
  head: () => ({
    meta: [
      { title: "Organizações — ChatRAG Master" },
      { name: "description", content: "Lista de organizações/tenants da plataforma ChatRAG com status, limites e criação." },
      { property: "og:title", content: "Organizações — ChatRAG Master" },
      { property: "og:description", content: "Gestão de tenants da plataforma ChatRAG." },
    ],
  }),
  component: TenantsList,
});

// TODO(API): GET /api/master/tenants · POST /api/master/tenants
function TenantsList() {
  const { scope } = useSession();
  const [open, setOpen] = useState(false);

  if (scope !== "master") {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Esta área é exclusiva do escopo Master. Alterne o perfil simulado na barra superior.
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Organizações"
        description="Todos os tenants da plataforma. O escopo Master não pertence a nenhuma organização."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus /> Criar tenant
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Criar organização</DialogTitle>
                <DialogDescription>
                  O usuário administrador inicial é criado pelo Master — não existe cadastro público.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="t-name">Nome da organização</Label>
                  <Input id="t-name" placeholder="Acme Serviços Financeiros" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="t-slug">Identificação</Label>
                  <Input id="t-slug" placeholder="acme" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="t-status">Status inicial</Label>
                  <Select defaultValue="ativo">
                    <SelectTrigger id="t-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="suspenso">Suspenso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="t-lim-a">Limite de assistentes</Label>
                    <Input id="t-lim-a" type="number" defaultValue={5} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="t-lim-s">Limite de fontes</Label>
                    <Input id="t-lim-s" type="number" defaultValue={200} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="t-lim-m">Mensagens/mês</Label>
                    <Input id="t-lim-m" type="number" defaultValue={15000} />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="t-admin">Administrador inicial</Label>
                    <Input id="t-admin" placeholder="Nome completo" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="t-email">E-mail</Label>
                    <Input id="t-email" type="email" placeholder="admin@empresa.com" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    setOpen(false);
                    toast.success("Tenant criado (simulado)");
                  }}
                >
                  Criar tenant
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organização</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assistentes</TableHead>
              <TableHead>Fontes</TableHead>
              <TableHead>Mensagens/mês</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <p className="font-medium">{t.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{t.slug}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {t.usage.assistants}/{t.limits.assistants}
                </TableCell>
                <TableCell className="tabular-nums">
                  {t.usage.sources}/{t.limits.sources}
                </TableCell>
                <TableCell className="tabular-nums">
                  {t.usage.messagesMonth.toLocaleString("pt-BR")}/{t.limits.messagesMonth.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-muted-foreground">{t.createdAt}</TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/tenants/$tenantId" params={{ tenantId: t.id }}>
                      Detalhes
                    </Link>
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
