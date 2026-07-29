import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/session";
import { assistants } from "@/lib/mock-data";

export const Route = createFileRoute("/assistentes/")({
  head: () => ({
    meta: [
      { title: "Assistentes — ChatRAG" },
      { name: "description", content: "Lista de assistentes de IA da organização com status e modelo selecionado." },
      { property: "og:title", content: "Assistentes — ChatRAG" },
      { property: "og:description", content: "Crie e configure assistentes de IA da sua base de conhecimento." },
    ],
  }),
  component: AssistantsList,
});

// TODO(API): GET /api/tenants/{id}/assistants
function AssistantsList() {
  const { can } = useSession();

  return (
    <>
      <PageHeader
        title="Assistentes"
        description="Cada assistente responde a partir das coleções de conhecimento selecionadas."
        actions={
          can("write") && (
            <Button onClick={() => toast.info("Formulário de novo assistente (simulado)")}>
              <Plus /> Novo assistente
            </Button>
          )
        }
      />
      <ActivationBanner context="publicação do assistente" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assistants.map((a) => (
          <Card key={a.id} className="transition-colors hover:border-primary/40">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{a.name}</CardTitle>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{a.model}</p>
              </div>
              <StatusBadge status={a.status} />
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Coleções</dt>
                  <dd>{a.collections.join(", ")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Conversas (30d)</dt>
                  <dd className="tabular-nums">{a.conversations30d.toLocaleString("pt-BR")}</dd>
                </div>
              </dl>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/assistentes/$assistantId" params={{ assistantId: a.id }}>
                    Configurar
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/playground" search={{ assistente: a.id }}>
                    Testar
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
