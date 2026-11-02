import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { contactTaxonomyApi, type ContactField } from "@/lib/contacts-api";

const typeLabel: Record<ContactField["type"], string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
};

/** Etiquetas e campos personalizados de contato (so administrador). */
export function TaxonomyDialog({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [tagName, setTagName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<ContactField["type"]>("texto");

  const tagsQuery = useQuery({
    queryKey: ["contact-tags", tenantId],
    queryFn: () => contactTaxonomyApi.tags(tenantId!),
    enabled: !!tenantId,
  });
  const fieldsQuery = useQuery({
    queryKey: ["contact-fields", tenantId],
    queryFn: () => contactTaxonomyApi.fields(tenantId!),
    enabled: !!tenantId,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["contact-tags", tenantId] });
    void queryClient.invalidateQueries({ queryKey: ["contact-fields", tenantId] });
    void queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
  };
  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: refresh,
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Tags />
          Etiquetas e campos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Etiquetas e campos</DialogTitle>
          <DialogDescription>
            Etiquetas organizam e filtram contatos. Campos personalizados guardam dados extras (como
            plano ou cidade) e viram colunas na importação e na exportação.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Etiquetas</h3>
          <div className="flex flex-wrap gap-1.5">
            {tagsQuery.data?.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="gap-1">
                {tag.name}
                <button
                  type="button"
                  aria-label={`Remover etiqueta ${tag.name}`}
                  onClick={() =>
                    action.mutate(() => contactTaxonomyApi.removeTag(tenantId!, tag.id))
                  }
                >
                  <Trash2 className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(() =>
                contactTaxonomyApi.createTag(tenantId!, tagName.trim()).then(() => setTagName("")),
              );
            }}
          >
            <Input
              placeholder="Nova etiqueta"
              maxLength={40}
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!tagName.trim()}>
              Adicionar
            </Button>
          </form>
        </section>

        <section className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-medium">Campos personalizados</h3>
          <ul className="space-y-1">
            {fieldsQuery.data?.map((field) => (
              <li key={field.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {field.label}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({typeLabel[field.type]} · coluna “{field.key}”)
                  </span>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover campo ${field.label}`}
                  onClick={() =>
                    action.mutate(() => contactTaxonomyApi.removeField(tenantId!, field.id))
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(() =>
                contactTaxonomyApi
                  .createField(tenantId!, fieldLabel.trim(), fieldType)
                  .then(() => setFieldLabel("")),
              );
            }}
          >
            <Input
              placeholder="Novo campo (ex.: Plano)"
              maxLength={60}
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
            />
            <Select
              value={fieldType}
              onValueChange={(v) => setFieldType(v as ContactField["type"])}
            >
              <SelectTrigger className="w-28" aria-label="Tipo do campo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(typeLabel) as ContactField["type"][]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {typeLabel[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={!fieldLabel.trim()}>
              Adicionar
            </Button>
          </form>
        </section>
      </DialogContent>
    </Dialog>
  );
}
