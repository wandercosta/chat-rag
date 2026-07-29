import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tenantUsers } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários e permissões — ChatRAG" },
      { name: "description", content: "Usuários da organização, perfis de acesso e convites administrativos." },
      { property: "og:title", content: "Usuários e permissões — ChatRAG" },
      { property: "og:description", content: "Convites por e-mail ou senha provisória; não há cadastro público." },
    ],
  }),
  component: UsersPage,
});

// TODO(API): GET /api/tenants/{id}/users · POST /api/tenants/{id}/invitations
function UsersPage() {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("email");

  if (!can("users")) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Seu perfil não tem acesso a usuários.</Card>;
  }

  return (
    <>
      <PageHeader
        title="Usuários e permissões"
        description="Todo acesso é criado por um administrador — o produto não possui cadastro público."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus /> Convidar usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Convidar usuário</DialogTitle>
                <DialogDescription>O acesso é vinculado apenas a esta organização.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="u-name">Nome</Label>
                  <Input id="u-name" placeholder="Nome completo" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="u-email">E-mail</Label>
                  <Input id="u-email" type="email" placeholder="pessoa@empresa.com" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="u-role">Perfil</Label>
                  <Select defaultValue="Analista">
                    <SelectTrigger id="u-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Administrador">Administrador</SelectItem>
                      <SelectItem value="Editor de base">Editor de base</SelectItem>
                      <SelectItem value="Analista">Analista</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Forma de acesso</Label>
                  <RadioGroup value={method} onValueChange={setMethod} className="gap-2">
                    <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                      <RadioGroupItem value="email" /> Convite por e-mail
                    </label>
                    <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                      <RadioGroupItem value="senha" /> Senha provisória com troca obrigatória no primeiro acesso
                    </label>
                  </RadioGroup>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    setOpen(false);
                    toast.success("Convite enviado (simulado)");
                  }}
                >
                  Enviar convite
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
              <TableHead>Usuário</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenantUsers.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{u.role}</Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge status={u.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{u.lastAccess}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
