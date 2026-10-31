import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, masterApi } from "@/lib/api-client";
import { platformUsageApi } from "@/lib/platform-usage-api";

const toNumber = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));

function PriceRow({ model, label }: { model: string; label: string }) {
  return (
    <span className="min-w-0 flex-1 truncate">
      <span className="font-medium">{label}</span>
      {label !== model && (
        <span className="ml-2 font-mono text-xs text-muted-foreground">{model}</span>
      )}
    </span>
  );
}

/**
 * Preco por modelo (US$ por 1 milhao de tokens) para o custo estimado do
 * consumo. Lista o catalogo e os modelos que ja responderam sem preco (ex.:
 * o Claude definido no .env), que entram no catalogo desligados.
 */
export function ModelPricesCard() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { input: string; output: string }>>({});
  const catalog = useQuery({
    queryKey: ["model-catalog"],
    queryFn: () => masterApi.listModelCatalog(),
  });
  const usage = useQuery({
    queryKey: ["platform-usage", "90"],
    queryFn: () => platformUsageApi.get(90),
  });

  const save = useMutation({
    mutationFn: (model: string) => {
      const draft = drafts[model];
      return masterApi.setModelPrice(model, toNumber(draft.input), toNumber(draft.output));
    },
    onSuccess: (_row, model) => {
      toast.success(`Preço de ${model} salvo`);
      setDrafts(({ [model]: _done, ...rest }) => rest);
      void queryClient.invalidateQueries({ queryKey: ["model-catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-usage"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o preço"),
  });

  const rows = catalog.data ?? [];
  const known = new Set(rows.map((m) => m.id));
  const unpriced = (usage.data?.unpricedModels ?? []).filter((id) => !known.has(id));
  const models = [
    ...unpriced.map((id) => ({ id, label: id, input: "", output: "" })),
    ...rows.map((m) => ({
      id: m.id,
      label: m.label,
      input: m.input_price_per_mtok ?? "",
      output: m.output_price_per_mtok ?? "",
    })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preço por modelo</CardTitle>
        <CardDescription>
          US$ por 1 milhão de tokens, entrada e saída, como cada provedor cobra. Modelo sem preço
          fica fora do custo estimado. Confira a tabela do provedor: os preços mudam.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {models.map((m) => {
          const draft = drafts[m.id] ?? { input: String(m.input), output: String(m.output) };
          const changed = !!drafts[m.id];
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-2">
              <PriceRow model={m.id} label={m.label} />
              {unpriced.includes(m.id) && (
                <span className="text-xs text-destructive">usado, sem preço</span>
              )}
              <Input
                className="h-8 w-24"
                inputMode="decimal"
                placeholder="entrada"
                aria-label={`Preço de entrada de ${m.id}`}
                value={draft.input}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [m.id]: { ...draft, input: e.target.value } }))
                }
              />
              <Input
                className="h-8 w-24"
                inputMode="decimal"
                placeholder="saída"
                aria-label={`Preço de saída de ${m.id}`}
                value={draft.output}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [m.id]: { ...draft, output: e.target.value } }))
                }
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!changed || save.isPending}
                onClick={() => save.mutate(m.id)}
              >
                Salvar
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
