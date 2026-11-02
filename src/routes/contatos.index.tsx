import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ImportContactsDialog } from "@/components/contacts/import-dialog";
import { NewContactDialog } from "@/components/contacts/new-contact-dialog";
import { SaveSegmentDialog } from "@/components/contacts/save-segment-dialog";
import { TaxonomyDialog } from "@/components/contacts/taxonomy-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  contactLabel,
  contactTaxonomyApi,
  contactsApi,
  isOptedIn,
  type ContactListQuery,
} from "@/lib/contacts-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/contatos/")({
  head: () => ({
    meta: [
      { title: "Contatos — ChatRAG" },
      {
        name: "description",
        content: "CRM de contatos: etiquetas, segmentos, importação e exportação CSV.",
      },
      { property: "og:title", content: "Contatos — ChatRAG" },
      { property: "og:description", content: "Contatos da organização com etiquetas e segmentos." },
    ],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  const { tenantId, profile, can } = useSession();
  const isAdmin = profile === "Administrador";
  const [search, setSearch] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [optIn, setOptIn] = useState<"todos" | "sim" | "nao">("todos");
  const [segmentId, setSegmentId] = useState("nenhum");
  const [page, setPage] = useState(1);

  const query: ContactListQuery = {
    search: search.trim() || undefined,
    tagIds,
    optIn: optIn === "todos" ? undefined : optIn === "sim",
    segmentId: segmentId === "nenhum" ? undefined : segmentId,
    page,
  };

  const listQuery = useQuery({
    queryKey: ["contacts", tenantId, query],
    queryFn: () => contactsApi.list(tenantId!, query),
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
  const segmentsQuery = useQuery({
    queryKey: ["contact-segments", tenantId],
    queryFn: () => contactTaxonomyApi.segments(tenantId!),
    enabled: !!tenantId,
  });

  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const toggleTag = (id: string) =>
    resetPage(setTagIds)(tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id]);

  const data = listQuery.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Contatos"
        description="Pessoas que falaram com a organização. Visitantes que se identificam no widget entram aqui sozinhos."
        actions={
          <>
            {isAdmin && <TaxonomyDialog tenantId={tenantId} />}
            {isAdmin && <ImportContactsDialog tenantId={tenantId} />}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  contactsApi
                    .exportCsv(tenantId!, { ...query, page: undefined })
                    .catch(() => toast.error("Não foi possível exportar"))
                }
              >
                <Download />
                Exportar CSV
              </Button>
            )}
            {can("contacts_write") && (
              <NewContactDialog
                tenantId={tenantId}
                tags={tagsQuery.data ?? []}
                fields={fieldsQuery.data ?? []}
              />
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Buscar nome, e-mail ou telefone"
          value={search}
          onChange={(e) => resetPage(setSearch)(e.target.value)}
        />
        <Select value={optIn} onValueChange={(v) => resetPage(setOptIn)(v as typeof optIn)}>
          <SelectTrigger className="w-48" aria-label="Opt-in">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sim">Aceitam campanhas</SelectItem>
            <SelectItem value="nao">Não aceitam campanhas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={segmentId} onValueChange={resetPage(setSegmentId)}>
          <SelectTrigger className="w-52" aria-label="Segmento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhum">Sem segmento</SelectItem>
            {segmentsQuery.data?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <SaveSegmentDialog
            tenantId={tenantId}
            disabled={!query.search && tagIds.length === 0 && query.optIn === undefined}
            filter={{ search: query.search, tagIds, tagMatch: "all", optIn: query.optIn }}
          />
        )}
      </div>
      {(tagsQuery.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por etiqueta">
          {tagsQuery.data?.map((tag) => (
            <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}>
              <Badge variant={tagIds.includes(tag.id) ? "default" : "outline"}>{tag.name}</Badge>
            </button>
          ))}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        {listQuery.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
        {data && data.items.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">Nenhum contato encontrado.</p>
        )}
        {data && data.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Etiquetas</TableHead>
                <TableHead>Campanhas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      to="/contatos/$contactId"
                      params={{ contactId: c.id }}
                      className="font-medium hover:underline"
                    >
                      {contactLabel(c)}
                    </Link>
                    {c.name && c.email && (
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <Badge key={t.id} variant="secondary">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isOptedIn(c) ? (
                      <Badge variant="outline">Aceita</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Não</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            {data.total} contatos · página {page} de {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </>
  );
}
