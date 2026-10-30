import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError, membersApi, type TenantRole } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários e permissões — ChatRAG" },
      {
        name: "description",
        content: "Usuários da organização, perfis de acesso e criação de acessos administrativos.",
      },
      { property: "og:title", content: "Usuários e permissões — ChatRAG" },
      {
        property: "og:description",
        content: "Acesso criado por administrador; não há cadastro público.",
      },
    ],
  }),
  component: UsersPage,
});

const roles: TenantRole[] = ["Administrador", "Editor de base", "Analista", "Atendente"];

function UsersPage() {
  const { can, tenantId, userEmail } = useSession();
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ["members", tenantId],
    queryFn: () => membersApi.list(tenantId!),
    enabled: !!tenantId && can("users"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["members", tenantId] });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: TenantRole }) =>
      membersApi.updateRole(tenantId!, id, role),
    onSuccess: () => {
      invalidate();
      toast.success("Papel atualizado");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível alterar o papel"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => membersApi.remove(tenantId!, id),
    onSuccess: () => {
      invalidate();
      toast.success("Acesso removido");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível remover o acesso"),
  });

  if (!can("users")) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Seu perfil não acessa usuários.
      </Card>
    );
  }

  if (!tenantId) {
    return (
      <>
        <PageHeader
          title="Usuários e permissões"
          description="Todo acesso é criado por um administrador — o produto não possui cadastro público."
        />
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Selecione uma organização no menu superior para visualizar ou gerenciar os usuários dela.
        </Card>
      </>
    );
  }

  const members = membersQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Usuários e permissões"
        description="Todo acesso é criado por um administrador — o produto não possui cadastro público."
        actions={<NewMemberDialog tenantId={tenantId} />}
      />

      <Card className="overflow-hidden p-0">
        {membersQuery.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
        {membersQuery.isError && (
          <p className="p-6 text-sm text-destructive">Não foi possível carregar os usuários.</p>
        )}
        {members.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Acesso criado em</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isSelf = m.email === userEmail;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.email}
                      {isSelf && (
                        <Badge variant="outline" className="ml-2">
                          você
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={m.role}
                        onValueChange={(role) =>
                          updateRole.mutate({ id: m.id, role: role as TenantRole })
                        }
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="w-44" aria-label={`Papel de ${m.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(m.id)}
                      >
                        <Trash2 /> Remover
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        A organização precisa manter pelo menos um administrador — o último não pode ser rebaixado
        nem removido.
      </p>
    </>
  );
}

function NewMemberDialog({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<TenantRole>("Analista");

  const create = useMutation({
    mutationFn: () => {
      if (!tenantId) {
        throw new ApiError(
          400,
          "Selecione uma organização no menu superior antes de criar um acesso.",
        );
      }
      return membersApi.create(tenantId, { email, password, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", tenantId] });
      setOpen(false);
      setEmail("");
      setPassword("");
      setRole("Analista");
      toast.success("Acesso criado — passe a senha provisória ao usuário");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível criar o acesso"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!tenantId}>
          <UserPlus /> Criar acesso
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar acesso</DialogTitle>
          <DialogDescription>
            Você define uma senha provisória e a repassa ao usuário — não há envio de e-mail nem
            cadastro público nesta fase. Se o e-mail já existir na plataforma, o usuário é
            reaproveitado e só ganha acesso a esta organização.
          </DialogDescription>
        </DialogHeader>
        {!tenantId && (
          <p className="rounded bg-amber-500/10 p-2.5 text-xs font-medium text-amber-700 dark:text-amber-500">
            Selecione uma organização no menu superior para criar um novo usuário.
          </p>
        )}
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="u-email">E-mail</Label>
            <Input
              id="u-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="u-pass">Senha provisória</Label>
            <Input
              id="u-pass"
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="u-role">Perfil</Label>
            <Select value={role} onValueChange={(v) => setRole(v as TenantRole)}>
              <SelectTrigger id="u-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!tenantId || create.isPending || password.length < 8 || !email}
            >
              {create.isPending ? "Criando..." : "Criar acesso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
