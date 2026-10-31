import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ApiError, assistantsApi, type Assistant } from "@/lib/api-client";

/**
 * O assistente so responde com trechos de fontes que alguem revisou (aprovou
 * na colecao com revisao ou marcou como revisada na Base de conhecimento).
 */
export function ReviewedSourcesCard({
  tenantId,
  assistant,
  readOnly,
  onSaved,
}: {
  tenantId: string | null;
  assistant: Assistant;
  readOnly: boolean;
  onSaved: (updated: Assistant) => void;
}) {
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      assistantsApi.update(tenantId!, assistant.id, { reviewedSourcesOnly: enabled }),
    onSuccess: (updated) => {
      toast.success(
        updated.reviewed_sources_only
          ? "O assistente só usa fontes revisadas"
          : "O assistente usa todas as fontes prontas",
      );
      onSaved(updated);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Só fontes revisadas</CardTitle>
          <CardDescription>
            O assistente ignora fontes que ninguém revisou, mesmo prontas. Revise na Base de
            conhecimento ("Marcar como revisada") ou aprovando fontes de coleções com revisão. Bom
            para assistentes públicos; os internos podem usar tudo.
          </CardDescription>
        </div>
        <Switch
          aria-label="Só fontes revisadas"
          checked={assistant.reviewed_sources_only}
          disabled={readOnly || save.isPending}
          onCheckedChange={(checked) => save.mutate(checked)}
        />
      </CardHeader>
    </Card>
  );
}
