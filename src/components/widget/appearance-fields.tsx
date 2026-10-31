import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { WidgetSettings } from "@/lib/api-client";

const DEFAULT_ACCENT = "#5B4FE9";

/** Campos de aparencia do widget, no assistente e no padrao da organizacao. */
export function WidgetAppearanceFields({
  settings,
  onChange,
  readOnly,
}: {
  settings: WidgetSettings;
  onChange: <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) => void;
  readOnly: boolean;
}) {
  const accent = settings.accentColor ?? DEFAULT_ACCENT;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="widget-title">Título</Label>
        <Input
          id="widget-title"
          maxLength={60}
          placeholder="Fale com a gente"
          value={settings.title ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange("title", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="widget-accent">Cor de destaque</Label>
        <div className="flex gap-2">
          <Input
            id="widget-accent"
            type="color"
            className="w-14 p-1"
            value={accent}
            disabled={readOnly}
            onChange={(e) => onChange("accentColor", e.target.value)}
          />
          <Input value={accent} readOnly className="font-mono" aria-label="Cor em hexadecimal" />
        </div>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="widget-greeting">Saudação</Label>
        <Textarea
          id="widget-greeting"
          rows={2}
          maxLength={300}
          placeholder="Olá! Como posso ajudar?"
          value={settings.greeting ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange("greeting", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Posição</Label>
        <Select
          value={settings.position ?? "bottom-right"}
          disabled={readOnly}
          onValueChange={(v) => onChange("position", v as WidgetSettings["position"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bottom-right">Canto inferior direito</SelectItem>
            <SelectItem value="bottom-left">Canto inferior esquerdo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Tema</Label>
        <Select
          value={settings.theme ?? "light"}
          disabled={readOnly}
          onValueChange={(v) => onChange("theme", v as WidgetSettings["theme"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Claro</SelectItem>
            <SelectItem value="dark">Escuro</SelectItem>
            <SelectItem value="sync">Seguir o sistema do visitante</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="widget-logo">Logo (endereço https)</Label>
        <Input
          id="widget-logo"
          type="url"
          maxLength={500}
          placeholder="https://seusite.com.br/logo.png"
          value={settings.logoUrl ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange("logoUrl", e.target.value)}
        />
      </div>
    </div>
  );
}
