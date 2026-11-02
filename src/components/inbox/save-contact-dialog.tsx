import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { contactsApi } from "@/lib/contacts-api";
import { useSession } from "@/lib/session";

/** Conversa de visitante anonimo vira contato (ou e ligada a um que ja existe). */
export function SaveContactDialog({
  tenantId,
  conversationId,
}: {
  tenantId: string | null;
  conversationId: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const save = useMutation({
    mutationFn: () =>
      contactsApi.fromConversation(tenantId!, conversationId, {
        name: name.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      }),
    onSuccess: (result) => {
      toast.success(result.merged ? "Conversa ligada ao contato que já existia" : "Contato criado");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["inbox", tenantId] });
      void queryClient.invalidateQueries({
        queryKey: ["inbox-conversation", tenantId, conversationId],
      });
      void queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o contato"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus />
          Salvar como contato
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Salvar como contato</DialogTitle>
          <DialogDescription>
            Se já existir um contato com o mesmo e-mail ou telefone, a conversa é ligada a ele.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="save-contact-name">Nome</Label>
            <Input id="save-contact-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="save-contact-email">E-mail</Label>
            <Input
              id="save-contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="save-contact-phone">Telefone</Label>
            <Input
              id="save-contact-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={save.isPending || (!email.trim() && !phone.trim() && !name.trim())}
            >
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Faixa do contato no topo da conversa: link para o CRM ou "salvar como". */
export function ConversationContact({
  tenantId,
  conversationId,
  contactId,
  contactLabel,
}: {
  tenantId: string | null;
  conversationId: string;
  contactId: string | null;
  contactLabel: string | null;
}) {
  const { can } = useSession();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm">
      {contactId ? (
        <Link
          to="/contatos/$contactId"
          params={{ contactId }}
          className="font-medium hover:underline"
        >
          {contactLabel ?? "Contato"}
        </Link>
      ) : (
        <span className="text-muted-foreground">Visitante sem contato no CRM</span>
      )}
      {!contactId && can("contacts_write") && (
        <SaveContactDialog tenantId={tenantId} conversationId={conversationId} />
      )}
    </div>
  );
}
