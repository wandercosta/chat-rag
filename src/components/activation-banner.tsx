import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { aiCredentialsApi, platformApi } from "@/lib/api-client";
import { useSession } from "@/lib/session";

/** Banner reutilizável de estado de ativação da base — reflete a credencial de IA real do
 * tenant. Some quando a plataforma já oferece IA própria (.env), sem chave do tenant. */
export function ActivationBanner({ context }: { context?: string }) {
  const { can, tenantId } = useSession();

  const credentialsQuery = useQuery({
    queryKey: ["ai-credentials", tenantId],
    queryFn: () => aiCredentialsApi.getStatus(tenantId!),
    enabled: !!tenantId,
  });

  const platformQuery = useQuery({
    queryKey: ["platform-ai"],
    queryFn: () => platformApi.ai(),
    staleTime: Infinity,
  });

  const hasValidKey = credentialsQuery.data?.some((c) => c.status === "valida") ?? false;
  if (!credentialsQuery.isSuccess || !platformQuery.isSuccess) return null;
  if (hasValidKey || platformQuery.data.available) return null;

  return (
    <Alert className="border-warning/40 bg-warning/10">
      <TriangleAlert className="size-4 text-warning" />
      <AlertTitle>Base aguardando ativação</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          Indexação de fontes, playground e widget ficam indisponíveis até existir uma chave de IA
          válida
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
