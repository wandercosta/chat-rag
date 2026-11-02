import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { channelsApi } from "@/lib/channels-api";

/**
 * Passadas 24 horas da ultima mensagem do cliente, o WhatsApp so aceita modelo
 * aprovado pela Meta (ADR-006 #9). O atendente escolhe o modelo e preenche as
 * variaveis ({{1}}, {{2}}...).
 */
export function TemplateComposer({
  tenantId,
  conversationId,
  connectionId,
  onSent,
}: {
  tenantId: string | null;
  conversationId: string;
  connectionId: string;
  onSent: () => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [params, setParams] = useState<string[]>([]);

  const templatesQuery = useQuery({
    queryKey: ["channel-templates", tenantId, connectionId],
    queryFn: () => channelsApi.templates(tenantId!, connectionId),
    enabled: !!tenantId,
  });
  const approved = (templatesQuery.data ?? []).filter((t) => t.status === "APPROVED");
  const template = approved.find((t) => t.id === templateId);

  const send = useMutation({
    mutationFn: () => channelsApi.sendTemplate(tenantId!, conversationId, templateId, params),
    onSuccess: () => {
      toast.success("Modelo enviado");
      setTemplateId("");
      setParams([]);
      onSent();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível enviar o modelo"),
  });

  const preview = template?.body.replace(
    /\{\{(\d+)\}\}/g,
    (_, n) => params[Number(n) - 1] || `{{${n}}}`,
  );

  return (
    <div className="space-y-2 border-t px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Passaram 24 horas da última mensagem do cliente. Pelo WhatsApp, agora só dá para enviar um
        modelo aprovado pela Meta; quando ele responder, a conversa volta ao normal.
      </p>
      {approved.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum modelo aprovado. Um administrador sincroniza os modelos em Canais.
        </p>
      ) : (
        <>
          <Select
            value={templateId}
            onValueChange={(id) => {
              setTemplateId(id);
              setParams(Array(approved.find((t) => t.id === id)?.variables ?? 0).fill(""));
            }}
          >
            <SelectTrigger className="h-8" aria-label="Modelo">
              <SelectValue placeholder="Escolha um modelo…" />
            </SelectTrigger>
            <SelectContent>
              {approved.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {params.map((value, i) => (
            <Input
              key={i}
              placeholder={`Variável {{${i + 1}}}`}
              value={value}
              onChange={(e) => setParams(params.map((p, j) => (j === i ? e.target.value : p)))}
            />
          ))}
          {preview && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{preview}</p>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!template || params.some((p) => !p.trim()) || send.isPending}
              onClick={() => send.mutate()}
            >
              Enviar modelo
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
