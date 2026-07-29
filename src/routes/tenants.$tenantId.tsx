import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, LifeBuoy, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auditEvents, tenants } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/tenants/$tenantId")({
  loader: ({ params }) => {
    // TODO(API): GET /api/master/tenants/{id}
    const tenant = tenants.find((t) => t.id === params.tenantId);
    if (!tenant) throw notFound();
    return { tenant };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.tenant.name} — ChatRAG Master` : "Organização — ChatRAG" },
      { name: "description", content: "Consumo, auditoria e ações administrativas da organização." },
      { property: "og:title", content: "Detalhe da organização — ChatRAG" },
      { property: "og:description", content: "Consumo, auditoria e acesso de suporte auditado." },
    ],
  }),
  component: TenantDetail,
});

function TenantDetail() {
  const { tenant } = Route.useLoaderData();
  const { support, startSupport } = useSession();
  const [status, setStatus] = useState(tenant.status);
  const [justification, setJustification] = useState("");
  const [open, setOpen] = useState(false);

  const rows = [
    { label: "Assistentes", used: tenant.usage.assistants, limit: tenant.limits.assistants },
    { label: "Fontes de conhecimento", used: tenant.usage.sources, limit: tenant.limits.sources },
    { label: "Mensagens no mês", used: tenant.usage.messagesMonth, limit: tenant.limits.messagesMonth },
  ];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/tenants">
          <ArrowLeft /> Organizações
        </Link>
      </Button>
      <PageHeader
        title={tenant.name}
        description={`Identificação ${tenant.slug} · criada em ${tenant.createdAt}`}
        actions={
          <>
            <StatusBadge status={status} className="h-9 px-3 text-sm" />
            {status === "ativo" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setStatus("suspenso");
                  toast.warning("Tenant suspenso (simulado)");
                }}
              >
                <PauseCircle /> Suspender
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setStatus("ativo");
                  toast.success("Tenant reativado (simulado)");
                }}
              >
                <PlayCircle /> Reativar
              </Button>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button disabled={!!support}>
                  <LifeBuoy /> Acesso de suporte
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Solicitar acesso de suporte</DialogTitle>
                  <DialogDescription>
                    A justificativa é obrigatória e fica registrada na auditoria do tenant.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                  <Label htmlFor="just">Justificativa</Label>
                  <Textarea
                    id="just"
                    rows={4}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Ex.: investigar falha de indexação reportada no chamado #4821"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={justification.trim().length < 10}
                    onClick={() => {
                      // TODO(API): POST /api/master/tenants/{id}/support-access
                      startSupport(tenant.id, justification.trim(), 30);
                      setOpen(false);
                      setJustification("");
                    }}
                  >
                    Ativar por 30 minutos
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <Tabs defaultValue="uso">
        <TabsList>
          <TabsTrigger value="uso">Uso e consumo</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="uso" className="mt-4 grid gap-4 md:grid-cols-3">
          {rows.map((r) => (
            <Card key={r.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{r.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-semibold tabular-nums">
                  {r.used.toLocaleString("pt-BR")}
                  <span className="text-base font-normal text-muted-foreground">
                    {" "}
                    / {r.limit.toLocaleString("pt-BR")}
                  </span>
                </p>
                <Progress value={(r.used / r.limit) * 100} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="auditoria" className="mt-4">
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quem</TableHead>
                  <TableHead>O quê</TableHead>
                  <TableHead>Alvo</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.actor}</TableCell>
                    <TableCell>{e.action}</TableCell>
                    <TableCell className="text-muted-foreground">{e.target}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{e.at}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
