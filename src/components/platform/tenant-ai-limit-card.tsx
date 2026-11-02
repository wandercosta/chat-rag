import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { aiQuotaApi, formatTokens, resetDay, type AiLimitMode } from "@/lib/ai-quota-api";

const toTokens = (value: string) => Number(value.replace(/\D/g, ""));

/**
 * Teto mensal da IA da plataforma para um tenant (ADR-007). So contagens:
 * nao exige sessao de suporte. Acima do teto, o assistente responde no modo
 * extrativo ate o mes virar.
 */
export function TenantAiLimitCard({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ mode: AiLimitMode; tokens: string } | null>(null);
  const query = useQuery({
    queryKey: ["master-ai-quota", tenantId],
    queryFn: () => aiQuotaApi.getAsMaster(tenantId),
  });
  const quota = query.data;

  const save = useMutation({
    mutationFn: (d: { mode: AiLimitMode; tokens: string }) =>
      aiQuotaApi.setLimit(tenantId, d.mode, d.mode === "personalizado" ? toTokens(d.tokens) : null),
    onSuccess: (data) => {
      queryClient.setQueryData(["master-ai-quota", tenantId], data);
      setDraft(null);
      toast.success("Limite de IA salvo");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o limite"),
  });

  if (!quota) return null;
  const current = draft ?? {
    mode: quota.mode,
    tokens: quota.customTokens ? String(quota.customTokens) : "",
  };
  const defaultLabel =
    quota.platformDefault === null
      ? "Padrão da plataforma (sem limite)"
      : `Padrão da plataforma (${formatTokens(quota.platformDefault)} tokens)`;
  const percent =
    quota.limit === null ? 0 : Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const invalid = current.mode === "personalizado" && !(toTokens(current.tokens) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Limite de IA da plataforma</CardTitle>
        <CardDescription>
          Tokens por mês das respostas geradas com a chave da plataforma; a chave própria do tenant
          não conta. Acima do limite, o assistente responde com o trecho da base, sem custo, até{" "}
          {resetDay(quota.resetsAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <p className="tabular-nums">
            {formatTokens(quota.used)} tokens usados neste mês
            {quota.limit !== null && ` de ${formatTokens(quota.limit)} (${percent}%)`}
            {quota.exceeded && <span className="ml-2 text-destructive">limite atingido</span>}
          </p>
          {quota.limit !== null && <Progress value={percent} aria-label="Uso do limite" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={current.mode}
            onValueChange={(mode) => setDraft({ ...current, mode: mode as AiLimitMode })}
          >
            <SelectTrigger className="h-9 w-72" aria-label="Modo do limite">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="padrao">{defaultLabel}</SelectItem>
              <SelectItem value="personalizado">Personalizado</SelectItem>
              <SelectItem value="sem_limite">Sem limite</SelectItem>
            </SelectContent>
          </Select>
          {current.mode === "personalizado" && (
            <Input
              className="h-9 w-40"
              inputMode="numeric"
              placeholder="tokens por mês"
              aria-label="Tokens por mês"
              value={current.tokens}
              onChange={(e) => setDraft({ ...current, tokens: e.target.value })}
            />
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!draft || invalid || save.isPending}
            onClick={() => save.mutate(current)}
          >
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
