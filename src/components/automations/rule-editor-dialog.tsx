import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, membersApi } from "@/lib/api-client";
import {
  actionLabel,
  allowedFor,
  automationsApi,
  conditionLabel,
  triggerLabel,
  type Rule,
  type RuleInput,
  type Trigger,
} from "@/lib/automations-api";
import { contactTaxonomyApi } from "@/lib/contacts-api";
import { newAction, newCondition } from "./rule-defaults";
import { ActionFields, ConditionFields } from "./rule-fields";

const empty: RuleInput = {
  name: "",
  trigger: "mensagem_recebida",
  conditions: [],
  actions: [{ type: "responder", text: "" }],
};

/** Adiciona um item escolhendo o tipo numa lista. */
function AddMenu<T extends string>({
  label,
  types,
  names,
  onAdd,
}: {
  label: string;
  types: T[];
  names: Record<T, string>;
  onAdd: (type: T) => void;
}) {
  return (
    <Select value="" onValueChange={(t) => onAdd(t as T)}>
      <SelectTrigger className="h-8 w-56" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {types.map((t) => (
          <SelectItem key={t} value={t}>
            {names[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Row({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{title}</span>
        <Button type="button" size="icon" variant="ghost" aria-label="Remover" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      {children}
    </div>
  );
}

/** Editor de regra "quando / se / entao" (ADR-006 #4). Editar cria uma versao nova. */
export function RuleEditorDialog({
  tenantId,
  rule,
  open,
  onOpenChange,
}: {
  tenantId: string | null;
  rule: Rule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<RuleInput>(empty);
  useEffect(() => {
    if (open) setValue(rule ? { ...rule } : empty);
  }, [open, rule]);

  const tagsQuery = useQuery({
    queryKey: ["contact-tags", tenantId],
    queryFn: () => contactTaxonomyApi.tags(tenantId!),
    enabled: !!tenantId && open,
  });
  const membersQuery = useQuery({
    queryKey: ["members", tenantId],
    queryFn: () => membersApi.list(tenantId!),
    enabled: !!tenantId && open,
  });
  const tags = (tagsQuery.data ?? []).map((t) => ({ id: t.id, label: t.name }));
  const agents = (membersQuery.data ?? [])
    .filter((m) => m.role === "Administrador" || m.role === "Atendente")
    .map((m) => ({ id: m.user_id, label: m.email }));

  const save = useMutation({
    mutationFn: () =>
      rule
        ? automationsApi.update(tenantId!, rule.id, value)
        : automationsApi.create(tenantId!, value),
    onSuccess: () => {
      toast.success(rule ? "Regra salva (nova versão)" : "Regra criada; ligue quando quiser");
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["automations", tenantId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  const allowed = allowedFor[value.trigger];
  const setTrigger = (trigger: Trigger) =>
    setValue({
      ...value,
      trigger,
      conditions:
        trigger === "sem_resposta"
          ? [newCondition("sem_resposta_ha")]
          : trigger === "etiqueta_adicionada"
            ? [newCondition("etiqueta_adicionada")]
            : [],
      actions: [newAction(allowedFor[trigger].actions[0])],
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar regra" : "Nova regra"}</DialogTitle>
          <DialogDescription>
            Quando o gatilho acontecer e todas as condições valerem, as ações rodam em ordem. A
            regra não usa IA: faz exatamente o que está aqui.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Nome</Label>
            <Input
              id="rule-name"
              maxLength={80}
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Quando</Label>
            <Select value={value.trigger} onValueChange={(t) => setTrigger(t as Trigger)}>
              <SelectTrigger aria-label="Gatilho">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(triggerLabel) as Trigger[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {triggerLabel[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Se (todas valem)</Label>
            {value.conditions.map((c, i) => (
              <Row
                key={i}
                title={conditionLabel[c.type]}
                onRemove={() =>
                  setValue({ ...value, conditions: value.conditions.filter((_, j) => j !== i) })
                }
              >
                <ConditionFields
                  value={c}
                  tags={tags}
                  onChange={(next) =>
                    setValue({
                      ...value,
                      conditions: value.conditions.map((x, j) => (j === i ? next : x)),
                    })
                  }
                />
              </Row>
            ))}
            <AddMenu
              label="Adicionar condição"
              types={allowed.conditions}
              names={conditionLabel}
              onAdd={(t) =>
                setValue({ ...value, conditions: [...value.conditions, newCondition(t)] })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Então</Label>
            {value.actions.map((a, i) => (
              <Row
                key={i}
                title={actionLabel[a.type]}
                onRemove={() =>
                  setValue({ ...value, actions: value.actions.filter((_, j) => j !== i) })
                }
              >
                <ActionFields
                  value={a}
                  tags={tags}
                  agents={agents}
                  tenantId={tenantId}
                  onChange={(next) =>
                    setValue({
                      ...value,
                      actions: value.actions.map((x, j) => (j === i ? next : x)),
                    })
                  }
                />
              </Row>
            ))}
            <AddMenu
              label="Adicionar ação"
              types={allowed.actions}
              names={actionLabel}
              onAdd={(t) => setValue({ ...value, actions: [...value.actions, newAction(t)] })}
            />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={!value.name.trim() || value.actions.length === 0 || save.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
