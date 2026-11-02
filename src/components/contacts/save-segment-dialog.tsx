import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { contactTaxonomyApi, type ContactFilter } from "@/lib/contacts-api";

/** Salva os filtros atuais da lista como segmento (publico das campanhas). */
export function SaveSegmentDialog({
  tenantId,
  filter,
  disabled,
}: {
  tenantId: string | null;
  filter: ContactFilter;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const save = useMutation({
    mutationFn: () => contactTaxonomyApi.createSegment(tenantId!, name.trim(), filter),
    onSuccess: () => {
      toast.success("Segmento salvo");
      setOpen(false);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["contact-segments", tenantId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o segmento"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <BookmarkPlus />
          Salvar segmento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Salvar segmento</DialogTitle>
          <DialogDescription>
            Guarda a busca, as etiquetas e o filtro de opt-in atuais. O segmento é recalculado a
            cada uso, então contatos novos que combinem entram sozinhos.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-4"
        >
          <Input
            placeholder="Ex.: VIP de São Paulo"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
