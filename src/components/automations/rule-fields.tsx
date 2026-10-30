import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Action, ChannelName, Condition } from "@/lib/automations-api";
import { channelLabel } from "@/lib/channels-api";

export interface Option {
  id: string;
  label: string;
}

const CHANNELS: ChannelName[] = ["widget", "whatsapp", "telegram", "instagram", "messenger"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Pick({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: Option[];
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8" aria-label={label}>
        <SelectValue placeholder="Escolha…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Campos da condicao conforme o tipo. */
export function ConditionFields({
  value,
  onChange,
  tags,
}: {
  value: Condition;
  onChange: (c: Condition) => void;
  tags: Option[];
}) {
  switch (value.type) {
    case "canal":
      return (
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((ch) => (
            <label key={ch} className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={value.channels.includes(ch)}
                onCheckedChange={(on) =>
                  onChange({
                    ...value,
                    channels: on ? [...value.channels, ch] : value.channels.filter((c) => c !== ch),
                  })
                }
              />
              {channelLabel[ch]}
            </label>
          ))}
        </div>
      );
    case "texto_contem":
      return (
        <Input
          className="h-8"
          placeholder="Palavras separadas por vírgula (sem diferença de acento)"
          value={value.keywords.join(", ")}
          onChange={(e) =>
            onChange({
              ...value,
              keywords: e.target.value
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
            })
          }
        />
      );
    case "contato_tem_etiqueta":
      return (
        <Pick
          label="Etiqueta"
          value={value.tagId}
          options={tags}
          onChange={(tagId) => onChange({ ...value, tagId })}
        />
      );
    case "fora_do_horario":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            Expediente das
            <Input
              type="time"
              className="h-8 w-28"
              value={value.start}
              onChange={(e) => onChange({ ...value, start: e.target.value })}
            />
            às
            <Input
              type="time"
              className="h-8 w-28"
              value={value.end}
              onChange={(e) => onChange({ ...value, end: e.target.value })}
            />
            (horário de Brasília)
          </div>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((day, i) => (
              <label key={day} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={value.weekdays.includes(i)}
                  onCheckedChange={(on) =>
                    onChange({
                      ...value,
                      weekdays: on ? [...value.weekdays, i] : value.weekdays.filter((d) => d !== i),
                    })
                  }
                />
                {day}
              </label>
            ))}
          </div>
        </div>
      );
    case "sem_resposta_ha":
      return (
        <Input
          type="number"
          min={1}
          className="h-8 w-32"
          value={value.minutes}
          onChange={(e) => onChange({ ...value, minutes: Number(e.target.value) || 1 })}
        />
      );
    default:
      return null;
  }
}

/** Campos da acao conforme o tipo. */
export function ActionFields({
  value,
  onChange,
  tags,
  agents,
}: {
  value: Action;
  onChange: (a: Action) => void;
  tags: Option[];
  agents: Option[];
}) {
  switch (value.type) {
    case "responder":
    case "nota_interna":
      return (
        <Textarea
          rows={2}
          value={value.text}
          placeholder={value.type === "responder" ? "Texto enviado ao cliente" : "Só a equipe vê"}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
      );
    case "adicionar_etiqueta":
      return (
        <Pick
          label="Etiqueta"
          value={value.tagId}
          options={tags}
          onChange={(tagId) => onChange({ ...value, tagId })}
        />
      );
    case "atribuir":
      return (
        <Pick
          label="Pessoa"
          value={value.userId}
          options={agents}
          onChange={(userId) => onChange({ ...value, userId })}
        />
      );
    default:
      return null;
  }
}
