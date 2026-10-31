import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, widgetDefaultsApi, type WidgetSettings } from "@/lib/api-client";
import { WidgetAppearanceFields } from "./appearance-fields";

/**
 * Aparencia padrao do widget da organizacao: vale para todos os assistentes;
 * cada assistente pode sobrescrever campo a campo.
 */
export function WidgetDefaultsCard({ tenantId }: { tenantId: string | null }) {
  const [settings, setSettings] = useState<WidgetSettings>({});
  const query = useQuery({
    queryKey: ["widget-defaults", tenantId],
    queryFn: () => widgetDefaultsApi.get(tenantId!),
    enabled: !!tenantId,
  });
  useEffect(() => {
    if (query.data) setSettings(query.data);
  }, [query.data]);

  const set = <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value || undefined }));

  const save = useMutation({
    mutationFn: () => widgetDefaultsApi.save(tenantId!, settings),
    onSuccess: () => toast.success("Aparência padrão do widget salva"),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Aparência padrão do widget</CardTitle>
          <CardDescription>
            Vale para todos os assistentes. O que estiver preenchido no assistente vence; os
            atributos <code>data-*</code> do script vencem os dois.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!tenantId || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save /> {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </CardHeader>
      <CardContent>
        <WidgetAppearanceFields settings={settings} onChange={set} readOnly={false} />
      </CardContent>
    </Card>
  );
}
