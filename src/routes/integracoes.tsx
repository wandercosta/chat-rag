import { createFileRoute } from "@tanstack/react-router";
import { Copy, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { widgetKeys } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações e widget — ChatRAG" },
      { name: "description", content: "Script de instalação, chaves por ambiente com domínios permitidos e preview do widget." },
      { property: "og:title", content: "Integrações e widget — ChatRAG" },
      { property: "og:description", content: "Instale o widget do ChatRAG em sites externos." },
    ],
  }),
  component: IntegrationsPage,
});

// TODO(API): GET /api/tenants/{id}/widget-keys · POST /api/widget-keys/{id}/revoke
function IntegrationsPage() {
  const { can } = useSession();
  const snippet =
    '<script src="https://cdn.chatrag.io/widget.js" data-key="wk_live_••••••••9f2b" data-mode="floating" async></script>';

  return (
    <>
      <PageHeader title="Integrações e widget" description="Instale o assistente em sites externos." />
      <ActivationBanner context="widget publicado" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Script de instalação</CardTitle>
          <CardDescription>Cole antes do fechamento de &lt;/body&gt; no site hospedeiro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-md border bg-muted/60 p-3 font-mono text-xs">{snippet}</pre>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(snippet);
              toast.success("Script copiado");
            }}
          >
            <Copy /> Copiar script
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ambiente</TableHead>
              <TableHead>Chave</TableHead>
              <TableHead>Domínios permitidos</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {widgetKeys.map((k) => (
              <TableRow key={k.id}>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {k.env}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{k.masked}</TableCell>
                <TableCell className="text-muted-foreground">{k.domains.join(", ")}</TableCell>
                <TableCell className="text-muted-foreground">{k.createdAt}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!can("integrations") || !can("write")}
                    onClick={() => toast.warning("Chave revogada (simulado)")}
                  >
                    <ShieldOff /> Revogar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pré-visualização do widget</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end rounded-lg border bg-muted/40 p-6">
            <div className="w-64 overflow-hidden rounded-lg border bg-card shadow-panel">
              <div className="bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">Atendimento Digital</div>
              <div className="space-y-2 p-3 text-xs">
                <p className="w-fit rounded-md bg-muted px-2 py-1">Olá! Como posso ajudar?</p>
                <p className="ml-auto w-fit rounded-md bg-primary px-2 py-1 text-primary-foreground">Quero suporte</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
