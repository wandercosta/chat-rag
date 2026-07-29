import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const toneMap: Record<Tone, string> = {
  success: "border-success/30 bg-success/12 text-success",
  warning: "border-warning/35 bg-warning/15 text-warning",
  danger: "border-destructive/30 bg-destructive/12 text-destructive",
  info: "border-info/30 bg-info/12 text-info",
  neutral: "border-border bg-muted text-muted-foreground",
};

const byLabel: Record<string, Tone> = {
  ativo: "success",
  publicado: "success",
  pronta: "success",
  válida: "success",
  resolvida: "success",
  positivo: "success",
  suspenso: "danger",
  erro: "danger",
  inválida: "danger",
  negativo: "danger",
  pausado: "warning",
  "aguardando revisão": "warning",
  pendente: "warning",
  "convite pendente": "warning",
  "senha provisória": "warning",
  substituída: "warning",
  processando: "info",
  "na fila": "info",
  rascunho: "neutral",
  arquivada: "neutral",
  "não configurada": "neutral",
  "sem feedback": "neutral",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = byLabel[status.toLowerCase()] ?? "neutral";
  return (
    <Badge variant="outline" className={cn("font-medium capitalize", toneMap[tone], className)}>
      {status}
    </Badge>
  );
}
