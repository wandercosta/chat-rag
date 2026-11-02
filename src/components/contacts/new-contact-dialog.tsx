import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-client";
import { contactsApi, type ContactField, type ContactTag } from "@/lib/contacts-api";
import { ContactForm } from "./contact-form";
import { emptyContactForm, toContactInput } from "./contact-form-values";

export function NewContactDialog({
  tenantId,
  tags,
  fields,
}: {
  tenantId: string | null;
  tags: ContactTag[];
  fields: ContactField[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(emptyContactForm);

  const create = useMutation({
    mutationFn: () => contactsApi.create(tenantId!, toContactInput(values)),
    onSuccess: () => {
      toast.success("Contato criado");
      setOpen(false);
      setValues(emptyContactForm);
      void queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível criar o contato"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Novo contato
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4"
        >
          <ContactForm values={values} onChange={setValues} tags={tags} fields={fields} />
          <DialogFooter>
            <Button
              type="submit"
              disabled={create.isPending || (!values.email.trim() && !values.phone.trim())}
            >
              Criar contato
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
