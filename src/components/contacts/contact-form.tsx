import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContactField, ContactTag } from "@/lib/contacts-api";
import type { ContactFormValues } from "./contact-form-values";

export function ContactForm({
  values,
  onChange,
  tags,
  fields,
  disabled,
}: {
  values: ContactFormValues;
  onChange: (values: ContactFormValues) => void;
  tags: ContactTag[];
  fields: ContactField[];
  disabled?: boolean;
}) {
  const set = <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) =>
    onChange({ ...values, [key]: value });

  const toggleTag = (id: string) =>
    set(
      "tagIds",
      values.tagIds.includes(id) ? values.tagIds.filter((t) => t !== id) : [...values.tagIds, id],
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="contact-name">Nome</Label>
          <Input
            id="contact-name"
            value={values.name}
            disabled={disabled}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-email">E-mail</Label>
          <Input
            id="contact-email"
            type="email"
            value={values.email}
            disabled={disabled}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-phone">Telefone</Label>
          <Input
            id="contact-phone"
            placeholder="(11) 99999-8888"
            value={values.phone}
            disabled={disabled}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        {fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={`field-${field.key}`}>{field.label}</Label>
            <Input
              id={`field-${field.key}`}
              type={field.type === "numero" ? "number" : field.type === "data" ? "date" : "text"}
              value={values.customFields[field.key] ?? ""}
              disabled={disabled}
              onChange={(e) =>
                set("customFields", { ...values.customFields, [field.key]: e.target.value })
              }
            />
          </div>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="space-y-1.5">
          <Label>Etiquetas</Label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const active = values.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={active}
                >
                  <Badge variant={active ? "default" : "outline"}>{tag.name}</Badge>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={values.optIn}
          disabled={disabled}
          onCheckedChange={(checked) => set("optIn", checked === true)}
        />
        <span>
          Aceita receber campanhas
          <span className="block text-xs text-muted-foreground">
            Só marque com o consentimento da pessoa. Desmarcar registra a saída, e campanhas deixam
            de chegar para ela.
          </span>
        </span>
      </label>
    </div>
  );
}
