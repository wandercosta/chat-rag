import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import {
  confidenceLabel,
  leadsApi,
  temperatureClass,
  temperatureLabel,
  type LeadInsight,
} from "@/lib/leads-api";
import { useSession } from "@/lib/session";

function InsightBody({ insight }: { insight: LeadInsight }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Badge className={temperatureClass[insight.temperature]}>
          {temperatureLabel[insight.temperature]}
        </Badge>
        <span className="text-xs text-muted-foreground">{confidenceLabel[insight.confidence]}</span>
      </p>
      <p>
        <span className="font-medium">Interesse:</span> {insight.interest}
      </p>
      <p>
        <span className="font-medium">Próximo passo:</span> {insight.nextStep}
      </p>
      <p className="text-muted-foreground">{insight.summary}</p>
    </div>
  );
}

/**
 * Classificacao do lead (ADR-009): a IA sugere, uma pessoa aceita ou
 * descarta. So funciona se o Administrador ligou em Configuracoes.
 */
export function LeadInsightCard({ tenantId, contactId }: { tenantId: string; contactId: string }) {
  const { can, profile } = useSession();
  const queryClient = useQueryClient();
  const canWrite = can("contacts_write");
  const settings = useQuery({
    queryKey: ["lead-settings", tenantId],
    queryFn: () => leadsApi.settings(tenantId),
  });
  const insights = useQuery({
    queryKey: ["lead-insights", tenantId, contactId],
    queryFn: () => leadsApi.forContact(tenantId, contactId),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["lead-insights", tenantId] });
    void queryClient.invalidateQueries({ queryKey: ["lead-current", tenantId] });
  };
  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível classificar");

  const classify = useMutation({
    mutationFn: () => leadsApi.classify(tenantId, contactId),
    onSuccess: refresh,
    onError: fail,
  });
  const review = useMutation({
    mutationFn: (input: { id: string; accepted: boolean }) =>
      leadsApi.review(tenantId, input.id, input.accepted),
    onSuccess: (_d, input) => {
      toast.success(input.accepted ? "Classificação aceita" : "Sugestão descartada");
      refresh();
    },
    onError: fail,
  });

  const enabled = settings.data?.enabled ?? false;
  const current = insights.data?.current;
  const pending = insights.data?.pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" /> Classificação do lead
        </CardTitle>
        <CardDescription>
          Sugestão da IA a partir das conversas recentes (sem e-mail nem telefone). Só vale depois
          que alguém aceita.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {current ? (
          <InsightBody insight={current} />
        ) : (
          <p className="text-sm text-muted-foreground">Ainda sem classificação aceita.</p>
        )}

        {pending && (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <p className="text-xs font-medium text-muted-foreground">Sugestão da IA</p>
            <InsightBody insight={pending} />
            {canWrite && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ id: pending.id, accepted: true })}
                >
                  Aceitar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ id: pending.id, accepted: false })}
                >
                  Descartar
                </Button>
              </div>
            )}
          </div>
        )}

        {canWrite && enabled && (
          <Button
            size="sm"
            variant="outline"
            disabled={classify.isPending}
            onClick={() => classify.mutate()}
          >
            <Sparkles /> {classify.isPending ? "Classificando…" : "Classificar com IA"}
          </Button>
        )}
        {!enabled && settings.isSuccess && (
          <p className="text-xs text-muted-foreground">
            {profile === "Administrador"
              ? "Desligada. Ligue em Configurações para usar."
              : "Desligada pelo administrador da organização."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
