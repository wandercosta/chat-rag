import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, masterApi, type SupportSession } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/tenants/$tenantId")({
  head: () => ({
    meta: [
      { title: "Organização — ChatRAG Master" },
      { name: "description", content: "Status, acesso de suporte auditado e chave de IA da organização." },
      { property: "og:title", content: "Detalhe da organização — ChatRAG" },
      { property: "og:description", content: "Suspensão, reativação e acesso de suporte auditado." },
    ],
  }),
  component: TenantDetail,
});

function isActive(s: SupportSession) {
  return !s.ended_at && new Date(s.expires_at).getTime() > Date.now();
}

function TenantDetail() {
  const { tenantId } = Route.useParams();
  const { scope } = useSession();
  const queryClient = useQueryClient();

  const tenantsQuery = useQuery({
    queryKey: ["master-tenants"],
    queryFn: () => masterApi.listTenants(),
    enabled: scope === "master",
  });

  const sessionsQuery = useQuery({
    queryKey: ["support-sessions", tenantId],
    queryFn: () => masterApi.listSupportSessions(tenantId),
    enabled: scope === "master",
  });

  const setStatus = useMutation({
    mutationFn: (status: "ativo" | "suspenso") => masterApi.setStatus(tenantId, status),
    onSuccess: (_d, status) => {
      queryClient.invalidateQueries({ queryKey: ["master-tenants"] });
      toast.success(status === "suspenso" ? "Organização suspensa" : "Organização reativada");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível alterar o status"),
  });

  const endSession = useMutation({
    mutationFn: (sessionId: string) => masterApi.endSupportSession(tenantId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-sessions", tenantId] });
      toast.success("Acesso de suporte encerrado");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível encerrar o acesso"),
  });

  if (scope !== "master") {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Área exclusiva do Master.</Card>;
  }

  const tenant = tenantsQuery.data?.find((t) => t.id === tenantId);
  const sessions = sessionsQuery.data ?? [];
  const active = sessions.find(isActive);

  if (tenantsQuery.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!tenant) return <p className="text-sm text-destructive">Organização não encontrada.</p>;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/tenants">
          <ArrowLeft /> Organizações
        </Link>
      </Button>
      <PageHeader
        title={tenant.name}
        description={`Slug ${tenant.slug} · criada em ${new Date(tenant.created_at).toLocaleDateString("pt-BR")}`}
        actions={
          <>
            <StatusBadge status={tenant.status} className="h-9 px-3 text-sm" />
            {tenant.status === "ativo" ? (
              <Button
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate("suspenso")}
              >
                <PauseCircle /> Suspender
              </Button>
            ) : (
              <Button disabled={setStatus.isPending} onClick={() => setStatus.mutate("ativo")}>
                <PlayCircle /> Reativar
              </Button>
            )}
            <StartSupportDialog tenantId={tenantId} hasActive={!!active} />
          </>
        }
      />

      {active && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <LifeBuoy className="size-4 text-warning" />
              <CardTitle className="text-base">Acesso de suporte ativo</CardTitle>
            </div>
            <CardDescription>
              Expira em {new Date(active.expires_at).toLocaleString("pt-BR")} · {active.justification}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              disabled={endSession.isPending}
              onClick={() => endSession.mutate(active.id)}
            >
              Encerrar agora
            </Button>
          </CardContent>
        </Card>
      )}

      <TenantCredentialsCard tenantId={tenantId} hasActiveSupport={!!active} />
      <TenantModelsCard tenantId={tenantId} />

      <Card className="overflow-hidden p-0">
        <CardHeader>
          <CardTitle className="text-base">Histórico de acessos de suporte</CardTitle>
          <CardDescription>
            Todo acesso do Master a dados deste tenant exige uma sessão justificada e expira sozinho.
          </CardDescription>
        </CardHeader>
        {sessionsQuery.isSuccess && sessions.length === 0 && (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum acesso de suporte registrado.</p>
        )}
        {sessions.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Justificativa</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Expira</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-md">{s.justification}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={isActive(s) ? "border-success/30 text-success" : "text-muted-foreground"}
                    >
                      {isActive(s) ? "ativa" : s.ended_at ? "encerrada" : "expirada"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.started_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.expires_at).toLocaleString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

/** O Master só enxerga o estado da chave do tenant (nunca o valor) e só com
 * uma sessão de suporte ativa — sem ela a API responde 403 de propósito. */
function TenantCredentialsCard({ tenantId, hasActiveSupport }: { tenantId: string; hasActiveSupport: boolean }) {
  const credentialsQuery = useQuery({
    queryKey: ["master-tenant-credentials", tenantId],
    queryFn: () => masterApi.getTenantCredentials(tenantId),
    enabled: hasActiveSupport,
    retry: false,
  });

  const configured = (credentialsQuery.data ?? []).filter(
    (c) => c.status !== "ausente" && c.status !== "removida",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chave de IA do tenant</CardTitle>
        <CardDescription>
          Somente o estado e o final mascarado — o valor da chave nunca é devolvido pela API.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasActiveSupport ? (
          <p className="text-sm text-muted-foreground">
            Inicie um acesso de suporte para consultar este estado.
          </p>
        ) : credentialsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : configured.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma chave configurada neste tenant.</p>
        ) : (
          <div className="space-y-2">
            {configured.map((c) => (
              <div key={c.environment} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="font-medium capitalize">{c.environment}</span>
                <StatusBadge status={c.status} />
                {c.masked && <span className="font-mono text-xs text-muted-foreground">{c.masked}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Modelos que este tenant pode usar. Nenhum marcado = sem restricao: valem os
 * modelos ativos do catalogo (ADR-004). Sem isso, um tenant novo nao conseguia
 * criar assistente algum e nao havia tela para liberar.
 */
function TenantModelsCard({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({ queryKey: ["model-catalog"], queryFn: () => masterApi.listModelCatalog() });
  const allowedQuery = useQuery({
    queryKey: ["tenant-models", tenantId],
    queryFn: () => masterApi.listTenantModels(tenantId),
  });

  const save = useMutation({
    mutationFn: (modelIds: string[]) => masterApi.setTenantModels(tenantId, modelIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-models", tenantId] });
      toast.success("Modelos do tenant atualizados");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar os modelos"),
  });

  const catalog = (catalogQuery.data ?? []).filter((m) => m.enabled);
  const allowedIds = new Set((allowedQuery.data ?? []).map((m) => m.id));
  // Lista igual ao catalogo inteiro = provavelmente o padrao, nao uma escolha.
  const unrestricted = allowedIds.size === catalog.length;

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(allowedIds);
    if (checked) next.add(id);
    else next.delete(id);
    // Desmarcar tudo volta ao padrao da plataforma em vez de travar o tenant.
    save.mutate(next.size === catalog.length ? [] : [...next]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Modelos liberados</CardTitle>
        <CardDescription>
          O tenant só escolhe modelos desta lista ao criar assistentes. Sem restrição, valem todos os modelos
          ativos do catálogo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {unrestricted && (
          <Badge variant="outline" className="border-success/30 text-success">
            Sem restrição — todos os modelos ativos
          </Badge>
        )}
        {catalogQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        <div className="space-y-2">
          {catalog.map((m) => (
            <label key={m.id} className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={allowedIds.has(m.id)}
                disabled={save.isPending}
                onCheckedChange={(v) => toggle(m.id, v === true)}
              />
              <span className="text-sm">
                <span className="font-mono text-xs font-medium">{m.label}</span>
                {m.note && <span className="block text-xs text-muted-foreground">{m.note}</span>}
              </span>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StartSupportDialog({ tenantId, hasActive }: { tenantId: string; hasActive: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [minutes, setMinutes] = useState(60);

  const start = useMutation({
    mutationFn: () => masterApi.startSupportSession(tenantId, justification, minutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-sessions", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["master-tenant-credentials", tenantId] });
      setOpen(false);
      setJustification("");
      toast.success("Acesso de suporte iniciado — a ação foi auditada");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível iniciar o acesso"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={hasActive}>
          <LifeBuoy /> Acesso de suporte
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Iniciar acesso de suporte</DialogTitle>
          <DialogDescription>
            Concede acesso temporário aos dados operacionais deste tenant. A justificativa fica registrada na
            auditoria e o acesso expira sozinho.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="s-just">Justificativa</Label>
            <Textarea
              id="s-just"
              rows={3}
              required
              minLength={10}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex.: investigar chamado #482 sobre falha de indexação"
            />
            <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-min">Duração (minutos)</Label>
            <Input
              id="s-min"
              type="number"
              min={5}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={start.isPending || justification.trim().length < 10}>
              {start.isPending ? "Iniciando..." : "Iniciar acesso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
