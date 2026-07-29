import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";

/**
 * Banner reutilizável de estado de ativação da base.
 * TODO(API): o estado virá de GET /api/tenants/{id}/ai-key-status.
 */
export function ActivationBanner({ context }: { context?: string }) {
  const { aiKeyReady, can } = useSession();
  if (aiKeyReady) return null;

  return (
    <Alert className="border-warning/40 bg-warning/10">
      <TriangleAlert className="size-4 text-warning" />
      <AlertTitle>Base aguardando ativação</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          Indexação de fontes, playground e widget ficam indisponíveis até existir uma chave de IA válida
          {context ? ` (${context})` : ""}.
        </span>
        {can("settings") && (
          <Button asChild size="sm" variant="outline">
            <Link to="/configuracoes">Configurar chave</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
