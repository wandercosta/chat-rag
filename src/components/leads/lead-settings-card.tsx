import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api-client";
import { leadsApi } from "@/lib/leads-api";

/** Liga ou desliga a classificacao de leads com IA (ADR-009 #1; so Administrador). */
export function LeadSettingsCard({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["lead-settings", tenantId],
    queryFn: () => leadsApi.settings(tenantId!),
    enabled: !!tenantId,
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => leadsApi.setEnabled(tenantId!, enabled),
    onSuccess: (data) => {
      queryClient.setQueryData(["lead-settings", tenantId], data);
      toast.success(data.enabled ? "Classificação ligada" : "Classificação desligada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Classificação de leads com IA</CardTitle>
        <CardDescription>
          Ligada, quem atende pode pedir na página do contato uma sugestão de temperatura (quente,
          morno ou frio), interesse e próximo passo. Vai ao modelo só o texto das conversas
          recentes, sem e-mail nem telefone; a sugestão só vale depois que alguém aceita, e o
          consumo conta no limite de IA da plataforma.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Switch
            id="lead-scoring"
            checked={query.data?.enabled ?? false}
            disabled={!query.isSuccess || toggle.isPending}
            onCheckedChange={(enabled) => toggle.mutate(enabled)}
          />
          <Label htmlFor="lead-scoring">{query.data?.enabled ? "Ligada" : "Desligada"}</Label>
        </div>
      </CardContent>
    </Card>
  );
}
