import { LifeBuoy, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { tenants } from "@/lib/mock-data";

/** Aviso permanente de modo de suporte ativo (simulado). */
export function SupportModeBanner() {
  const { support, supportRemaining, endSupport } = useSession();
  if (!support) return null;
  const tenant = tenants.find((t) => t.id === support.tenantId);

  return (
    <Alert className="rounded-none border-x-0 border-t-0 border-destructive/40 bg-destructive/12">
      <LifeBuoy className="size-4 text-destructive" />
      <AlertTitle className="text-destructive">
        Modo de suporte ativo — {tenant?.name} · expira em {supportRemaining}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>Justificativa registrada: “{support.justification}”. Todas as ações ficam auditadas.</span>
        <Button size="sm" variant="outline" onClick={endSupport}>
          <X /> Encerrar acesso
        </Button>
      </AlertDescription>
    </Alert>
  );
}
