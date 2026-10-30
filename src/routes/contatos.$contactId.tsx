import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ContactForm } from "@/components/contacts/contact-form";
import {
  emptyContactForm,
  toContactInput,
  type ContactFormValues,
} from "@/components/contacts/contact-form-values";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import {
  contactLabel,
  contactTaxonomyApi,
  contactsApi,
  isOptedIn,
  type ContactDetail,
} from "@/lib/contacts-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/contatos/$contactId")({
  head: () => ({
    meta: [
      { title: "Contato — ChatRAG" },
      { name: "description", content: "Dados, etiquetas e conversas de um contato." },
    ],
  }),
  component: ContactPage,
});

const channelLabel: Record<string, string> = {
  widget: "Widget do site",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  messenger: "Messenger",
};

function formFrom(contact: ContactDetail): ContactFormValues {
  return {
    name: contact.name ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    optIn: isOptedIn(contact),
    tagIds: contact.tags.map((t) => t.id),
    customFields: contact.custom_fields ?? {},
  };
}

function ContactPage() {
  const { contactId } = Route.useParams();
  const { tenantId, profile, can } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState(emptyContactForm);

  const contactQuery = useQuery({
    queryKey: ["contact", tenantId, contactId],
    queryFn: () => contactsApi.get(tenantId!, contactId),
    enabled: !!tenantId,
  });
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

  useEffect(() => {
    if (contactQuery.data) setValues(formFrom(contactQuery.data));
  }, [contactQuery.data]);

  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar");
  const save = useMutation({
    mutationFn: () => contactsApi.update(tenantId!, contactId, toContactInput(values)),
    onSuccess: () => {
      toast.success("Contato salvo");
      void queryClient.invalidateQueries({ queryKey: ["contact", tenantId, contactId] });
      void queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => contactsApi.remove(tenantId!, contactId),
    onSuccess: () => {
      toast.success("Contato e conversas excluídos");
      void queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
      void navigate({ to: "/contatos" });
    },
    onError,
  });

  const contact = contactQuery.data;
  const readOnly = !can("contacts_write");

  return (
    <>
      <Link
        to="/contatos"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> Contatos
      </Link>
      <PageHeader
        title={contact ? contactLabel(contact) : "Contato"}
        description={
          contact?.opt_in_at && isOptedIn(contact)
            ? `Aceita campanhas desde ${new Date(contact.opt_in_at).toLocaleDateString("pt-BR")} (${contact.opt_in_source}).`
            : contact?.opted_out_at
              ? `Pediu para não receber campanhas em ${new Date(contact.opted_out_at).toLocaleDateString("pt-BR")}.`
              : "Não aceitou campanhas."
        }
        actions={
          profile === "Administrador" && contact ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2 />
                  Excluir contato
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {contactLabel(contact)}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Apaga o contato, as etiquetas dele e as {contact.conversations.length}{" "}
                    conversa(s) ligadas a ele. Use quando o titular pedir a exclusão dos dados
                    (LGPD). Não dá para desfazer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null
        }
      />

      {contactQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {contactQuery.isError && (
        <p className="text-sm text-muted-foreground">Contato não encontrado.</p>
      )}

      {contact && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <Card>
            <CardHeader>
              <CardTitle>Dados</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate();
                }}
              >
                <ContactForm
                  values={values}
                  onChange={setValues}
                  tags={tagsQuery.data ?? []}
                  fields={fieldsQuery.data ?? []}
                  disabled={readOnly}
                />
                {!readOnly && (
                  <div className="flex justify-end">
                    <Button type="submit" disabled={save.isPending}>
                      Salvar
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Canais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {contact.identities.length === 0 && (
                  <p className="text-muted-foreground">Cadastrado à mão ou por importação.</p>
                )}
                {contact.identities.map((i) => (
                  <p key={i.id}>
                    <Badge variant="outline">{channelLabel[i.channel] ?? i.channel}</Badge>{" "}
                    <span className="text-xs text-muted-foreground">
                      desde {new Date(i.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </p>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {contact.conversations.length === 0 && (
                  <p className="text-muted-foreground">Nenhuma conversa ainda.</p>
                )}
                {contact.conversations.map((c) => (
                  <div key={c.id} className="space-y-0.5 border-b pb-2 last:border-0">
                    <p className="text-xs text-muted-foreground">
                      {channelLabel[c.channel] ?? c.channel} ·{" "}
                      {new Date(c.last_activity_at).toLocaleString("pt-BR")}
                    </p>
                    <p className="line-clamp-2">{c.last_message?.content ?? "Sem mensagens."}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
