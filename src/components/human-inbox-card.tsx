import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ApiError, assistantsApi, type Assistant } from "@/lib/api-client";

/**
 * Liga o atendimento humano pelo painel (ADR-006): o botao do widget passa a
 * colocar a conversa na caixa de entrada, e o atendente responde ali mesmo.
 * Desligado, o botao continua abrindo o WhatsApp do setor.
 */
export function HumanInboxCard({
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
      assistantsApi.update(tenantId!, assistant.id, { humanInboxEnabled: enabled }),
    onSuccess: (updated) => {
      toast.success(
        updated.human_inbox_enabled
          ? "Pedidos de atendente vão para a caixa de entrada"
          : "Pedidos de atendente voltam a abrir o WhatsApp",
      );
      onSaved(updated);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar");
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Atendimento humano pelo painel</CardTitle>
          <CardDescription>
            O botão "Falar com atendente" do widget coloca a conversa na caixa de entrada e o
            assistente para de responder até a conversa ser resolvida. Desligado, o botão abre o
            WhatsApp configurado abaixo.
          </CardDescription>
        </div>
        <Switch
          aria-label="Atendimento humano pelo painel"
          checked={assistant.human_inbox_enabled}
          disabled={readOnly || save.isPending}
          onCheckedChange={(checked) => save.mutate(checked)}
        />
      </CardHeader>
    </Card>
  );
}
