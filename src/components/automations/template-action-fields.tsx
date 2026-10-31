import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import type { Action } from "@/lib/automations-api";
import { channelsApi } from "@/lib/channels-api";
import { Pick } from "./rule-fields";

type SendTemplate = Extract<Action, { type: "enviar_modelo" }>;

/**
 * Acao "enviar modelo do WhatsApp": numero, modelo aprovado e as variaveis
 * ({{1}}, {{2}}...). `{nome}` numa variavel vira o nome do contato.
 */
export function TemplateActionFields({
  tenantId,
  value,
  onChange,
}: {
  tenantId: string | null;
  value: SendTemplate;
  onChange: (a: Action) => void;
}) {
  const channelsQuery = useQuery({
    queryKey: ["channels", tenantId],
    queryFn: () => channelsApi.list(tenantId!),
    enabled: !!tenantId,
  });
  const templatesQuery = useQuery({
    queryKey: ["channel-templates", tenantId, value.connectionId],
    queryFn: () => channelsApi.templates(tenantId!, value.connectionId),
    enabled: !!tenantId && !!value.connectionId,
  });

  const numbers = (channelsQuery.data ?? [])
    .filter((c) => c.provider === "whatsapp")
    .map((c) => ({ id: c.id, label: c.name }));
  const approved = (templatesQuery.data ?? []).filter((t) => t.status === "APPROVED");
  const template = approved.find((t) => t.id === value.templateId);

  return (
    <div className="space-y-2">
      {numbers.length === 0 && channelsQuery.isSuccess && (
        <p className="text-xs text-muted-foreground">Conecte um número do WhatsApp em Canais.</p>
      )}
      <Pick
        label="Número"
        value={value.connectionId}
        options={numbers}
        onChange={(connectionId) =>
          onChange({ ...value, connectionId, templateId: "", params: [] })
        }
      />
      {value.connectionId && (
        <Pick
          label="Modelo"
          value={value.templateId}
          options={approved.map((t) => ({ id: t.id, label: `${t.name} (${t.language})` }))}
          onChange={(templateId) => {
            const variables = approved.find((t) => t.id === templateId)?.variables ?? 0;
            onChange({ ...value, templateId, params: Array(variables).fill("") });
          }}
        />
      )}
      {template && (
        <>
          <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{template.body}</p>
          {value.params.map((param, i) => (
            <Input
              key={i}
              className="h-8"
              placeholder={`Variável {{${i + 1}}} (use {nome} para o nome do contato)`}
              value={param}
              onChange={(e) =>
                onChange({
                  ...value,
                  params: value.params.map((p, j) => (j === i ? e.target.value : p)),
                })
              }
            />
          ))}
        </>
      )}
    </div>
  );
}
