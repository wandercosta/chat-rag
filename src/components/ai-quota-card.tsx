import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { aiQuotaApi, formatTokens, resetDay } from "@/lib/ai-quota-api";
import { useSession } from "@/lib/session";

/**
 * Consumo do mes da IA incluida na plataforma, para o tenant (ADR-007). So
 * aparece quando ha teto; quem define e o Master.
 */
export function AiQuotaCard() {
  const { tenantId, profile } = useSession();
  const allowed = profile === "Administrador" || profile === "Analista";
  const query = useQuery({
    queryKey: ["ai-quota", tenantId],
    queryFn: () => aiQuotaApi.get(tenantId!),
    enabled: !!tenantId && allowed,
  });
  const quota = query.data;
  if (!quota || quota.limit === null) return null;

  const percent = Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const until = resetDay(quota.resetsAt);
  return (
    <Card className={quota.exceeded ? "border-destructive/40 bg-destructive/5" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">IA incluída na plataforma</CardTitle>
        <CardDescription>
          {quota.exceeded
            ? `Limite do mês atingido. Até ${until}, o assistente responde com o trecho mais relevante da base, sem gerar texto. Para voltar antes, cadastre a chave da OpenAI da organização ou peça um limite maior ao suporte.`
            : `Respostas geradas com a IA da plataforma. O limite volta em ${until}; com a chave própria da organização, nada conta aqui.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={percent} aria-label="Uso do limite mensal" />
        <p className="text-sm tabular-nums text-muted-foreground">
          {formatTokens(quota.used)} de {formatTokens(quota.limit)} tokens ({percent}%)
        </p>
      </CardContent>
    </Card>
  );
}
