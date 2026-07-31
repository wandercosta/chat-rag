import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { masterApi, ApiError, type CreateTenantInput } from "@/lib/api-client";

export const Route = createFileRoute("/tenants/")({
  head: () => ({
    meta: [
      { title: "Organizações — ChatRAG Master" },
      {
        name: "description",
        content: "Lista de organizações/tenants da plataforma ChatRAG com status e criação.",
      },
      { property: "og:title", content: "Organizações — ChatRAG Master" },
      { property: "og:description", content: "Gestão de tenants da plataforma ChatRAG." },
    ],
  }),
  component: TenantsList,
});

const emptyForm: CreateTenantInput = { name: "", slug: "", adminEmail: "", adminPassword: "" };

function TenantsList() {
  const { scope } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateTenantInput>(emptyForm);

  const tenantsQuery = useQuery({
    queryKey: ["master", "tenants"],
    queryFn: masterApi.listTenants,
    enabled: scope === "master",
  });

  const createTenant = useMutation({
    mutationFn: () => masterApi.createTenant(form),
    onSuccess: () => {
      toast.success("Tenant criado");
      setOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["master", "tenants"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível criar o tenant");
    },
  });

  if (scope !== "master") {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Esta área é exclusiva do escopo Master.
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
                  O usuário administrador inicial é criado pelo Master — não existe cadastro
                  público.
                </DialogDescription>
              </DialogHeader>
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createTenant.mutate();
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="t-name">Nome da organização</Label>
                  <Input
                    id="t-name"
                    placeholder="Acme Serviços Financeiros"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="t-slug">Identificação (slug)</Label>
                  <Input
                    id="t-slug"
                    placeholder="acme"
                    pattern="[a-z0-9-]+"
                    title="letras minúsculas, números e hífen"
                    required
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="t-email">E-mail do administrador</Label>
                    <Input
                      id="t-email"
                      type="email"
                      placeholder="admin@empresa.com"
                      required
                      value={form.adminEmail}
                      onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="t-pass">Senha inicial</Label>
                    <Input
                      id="t-pass"
                      type="password"
                      minLength={8}
                      required
                      value={form.adminPassword}
                      onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createTenant.isPending}>
                    {createTenant.isPending ? "Criando..." : "Criar tenant"}
                  </Button>
                </DialogFooter>
              </form>
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
              <TableHead>Criada em</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenantsQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {tenantsQuery.data?.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <p className="font-medium">{t.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{t.slug}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
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
