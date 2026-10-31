import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ApiError,
  collectionsApi,
  sourcesApi,
  topicsApi,
  type Collection,
  type Source,
  type Topic,
} from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/conhecimento")({
  head: () => ({
    meta: [
      { title: "Base de conhecimento — ChatRAG" },
      {
        name: "description",
        content: "Tópicos e fontes da base de conhecimento privada, com status de indexação.",
      },
      { property: "og:title", content: "Base de conhecimento — ChatRAG" },
      {
        property: "og:description",
        content: "Gerencie tópicos, fontes e reindexação da base privada.",
      },
    ],
  }),
  component: KnowledgePage,
});

const statusLabel: Record<Source["status"], string> = {
  rascunho: "rascunho",
  aguardando_revisao: "aguardando revisão",
  aguardando_ativacao: "aguardando ativação",
  fila: "na fila",
  processando: "processando",
  pronta: "pronta",
  erro: "erro",
  arquivada: "arquivada",
};

function KnowledgePage() {
  const { can, tenantId } = useSession();
  const writable = can("write");

  const topicsQuery = useQuery({
    queryKey: ["topics", tenantId],
    queryFn: () => topicsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const collectionsQuery = useQuery({
    queryKey: ["collections", tenantId],
    queryFn: () => collectionsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const topics = topicsQuery.data ?? [];
  const collections = collectionsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Base de conhecimento"
        description="Tópicos agrupam as fontes que alimentam os assistentes."
        actions={
          writable && (
            <div className="flex gap-2">
              <NewCollectionDialog tenantId={tenantId} />
              <NewTopicDialog tenantId={tenantId} collections={collections} />
              <NewSourceDialog tenantId={tenantId} topics={topics} />
            </div>
          )
        }
      />
      <ActivationBanner context="indexação de fontes" />

      {topicsQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {topicsQuery.isSuccess && topics.length === 0 && (
        <Card className="border-dashed p-6 text-sm text-muted-foreground">
          Nenhum tópico ainda. Crie um tópico para começar a cadastrar fontes.
        </Card>
      )}

      <Accordion
        type="multiple"
        defaultValue={topics.slice(0, 1).map((t) => t.id)}
        className="space-y-3"
      >
        {topics.map((topic) => (
          <TopicSection
            key={topic.id}
            topic={topic}
            tenantId={tenantId}
            writable={writable}
            collections={collections}
          />
        ))}
      </Accordion>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Nota de operação
          </CardTitle>
          <CardDescription>
            A ordem de processamento é: rascunho → aguardando revisão → na fila → processando →
            pronta. Sem chave de IA válida, as fontes ficam em “aguardando ativação”.
          </CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}

function TopicSection({
  topic,
  tenantId,
  writable,
  collections,
}: {
  topic: Topic;
  tenantId: string | null;
  writable: boolean;
  collections: Collection[];
}) {
  const queryClient = useQueryClient();

  const sourcesQuery = useQuery({
    queryKey: ["sources", tenantId, topic.id],
    queryFn: () => sourcesApi.list(tenantId!, topic.id),
    enabled: !!tenantId,
  });

  const moveToCollection = useMutation({
    mutationFn: (collectionId: string | null) =>
      topicsApi.update(tenantId!, topic.id, { collectionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", tenantId] });
      toast.success("Coleção do tópico atualizada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível mover o tópico"),
  });

  const collectionName = collections.find((c) => c.id === topic.collection_id)?.name;

  const action = useMutation({
    mutationFn: ({
      sourceId,
      kind,
    }: {
      sourceId: string;
      kind: "approve" | "reindex" | "archive" | "review" | "unreview";
    }) =>
      kind === "review" || kind === "unreview"
        ? sourcesApi.review(tenantId!, sourceId, kind === "review")
        : sourcesApi[kind](tenantId!, sourceId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sources", tenantId, topic.id] });
      const messages = {
        approve: "Fonte aprovada",
        reindex: "Reindexação enfileirada",
        archive: "Fonte arquivada",
        review: "Fonte marcada como revisada",
        unreview: "Revisão retirada",
      };
      toast.success(messages[variables.kind]);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir a ação"),
  });

  const sources = sourcesQuery.data ?? [];

  return (
    <AccordionItem value={topic.id} className="rounded-lg border bg-card px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="text-left">
          <p className="font-medium">{topic.name}</p>
          <p className="text-xs text-muted-foreground">
            {topic.description ? `${topic.description} · ` : ""}
            {sourcesQuery.isSuccess ? `${sources.length} fontes` : "…"}
            {collectionName && ` · coleção ${collectionName}`}
          </p>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {writable && collections.length > 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-md border border-dashed p-3">
            <Label htmlFor={`col-${topic.id}`} className="text-xs text-muted-foreground">
              Coleção
            </Label>
            <Select
              value={topic.collection_id ?? "none"}
              onValueChange={(v) => moveToCollection.mutate(v === "none" ? null : v)}
              disabled={moveToCollection.isPending}
            >
              <SelectTrigger id={`col-${topic.id}`} className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem coleção</SelectItem>
                {collections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Só assistentes vinculados a esta coleção consultarão este tópico.
            </p>
          </div>
        )}
        {sourcesQuery.isLoading && (
          <p className="py-3 text-sm text-muted-foreground">Carregando fontes…</p>
        )}
        {sourcesQuery.isSuccess && sources.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">Nenhuma fonte neste tópico ainda.</p>
        )}
        {sources.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trechos</TableHead>
                <TableHead>Atualizada</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.title}
                    {s.error_message && (
                      <p className="text-xs text-destructive">{s.error_message}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.kind}</TableCell>
                  <TableCell>
                    <StatusBadge status={statusLabel[s.status]} />
                    {s.reviewed_at && (
                      <Badge
                        variant="outline"
                        className="ml-1"
                        title={`Revisada em ${new Date(s.reviewed_at).toLocaleDateString("pt-BR")}`}
                      >
                        revisada
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{s.chunk_count}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.updated_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="flex justify-end gap-1 text-right">
                    {s.status === "aguardando_revisao" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!writable || action.isPending}
                        onClick={() => action.mutate({ sourceId: s.id, kind: "approve" })}
                      >
                        <Check /> Aprovar
                      </Button>
                    )}
                    {s.status !== "aguardando_revisao" && s.status !== "arquivada" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!writable || action.isPending}
                        onClick={() =>
                          action.mutate({
                            sourceId: s.id,
                            kind: s.reviewed_at ? "unreview" : "review",
                          })
                        }
                      >
                        <Check /> {s.reviewed_at ? "Tirar revisão" : "Marcar como revisada"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!writable || action.isPending || s.status === "arquivada"}
                      onClick={() => action.mutate({ sourceId: s.id, kind: "reindex" })}
                    >
                      <RefreshCw /> Reindexar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!writable || action.isPending || s.status === "arquivada"}
                      onClick={() => action.mutate({ sourceId: s.id, kind: "archive" })}
                    >
                      <Archive /> Arquivar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function NewCollectionDialog({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () => collectionsApi.create(tenantId!, { name, description: description || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections", tenantId] });
      setOpen(false);
      setName("");
      setDescription("");
      toast.success("Coleção criada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível criar a coleção"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Nova coleção
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova coleção</DialogTitle>
          <DialogDescription>
            Coleções restringem o que cada assistente consulta. Um assistente sem nenhuma coleção
            vinculada continua consultando toda a base.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="c-name">Nome</Label>
            <Input
              id="c-name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-desc">Descrição (opcional)</Label>
            <Input
              id="c-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
              {create.isPending ? "Criando..." : "Criar coleção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewTopicDialog({
  tenantId,
  collections,
}: {
  tenantId: string | null;
  collections: Collection[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [collectionId, setCollectionId] = useState("none");

  const create = useMutation({
    mutationFn: () =>
      topicsApi.create(tenantId!, {
        name,
        description: description || null,
        collectionId: collectionId === "none" ? null : collectionId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", tenantId] });
      setOpen(false);
      setName("");
      setDescription("");
      toast.success("Tópico criado");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível criar o tópico"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Novo tópico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo tópico</DialogTitle>
          <DialogDescription>Agrupa fontes relacionadas dentro da base.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="t-name">Nome</Label>
            <Input
              id="t-name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-desc">Descrição (opcional)</Label>
            <Input
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {collections.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="t-col">Coleção (opcional)</Label>
              <Select value={collectionId} onValueChange={setCollectionId}>
                <SelectTrigger id="t-col">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem coleção</SelectItem>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
              {create.isPending ? "Criando..." : "Criar tópico"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewSourceDialog({ tenantId, topics }: { tenantId: string | null; topics: Topic[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"texto" | "URL" | "arquivo">("texto");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setTopicId("");
    setTitle("");
    setKind("texto");
    setContent("");
    setFile(null);
  };

  const create = useMutation({
    mutationFn: () => {
      if (kind === "arquivo") {
        return sourcesApi.upload(tenantId!, topicId, title, file!);
      }
      return sourcesApi.createTextOrUrl(tenantId!, { topicId, title, kind, content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sources", tenantId, topicId] });
      setOpen(false);
      reset();
      toast.success("Fonte cadastrada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível cadastrar a fonte"),
  });

  const ready =
    topicId &&
    title.trim().length >= 2 &&
    (kind === "arquivo" ? !!file : content.trim().length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={topics.length === 0}>
          <Plus /> Adicionar fonte
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar fonte</DialogTitle>
          <DialogDescription>
            Texto, URL ou arquivo (PDF/DOCX). A indexação entra na fila automaticamente quando há
            chave de IA válida.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="s-topic">Tópico</Label>
            <Select value={topicId} onValueChange={setTopicId}>
              <SelectTrigger id="s-topic">
                <SelectValue placeholder="Selecione um tópico" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-title">Título</Label>
            <Input
              id="s-title"
              required
              minLength={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-kind">Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger id="s-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="texto">Texto</SelectItem>
                <SelectItem value="URL">URL</SelectItem>
                <SelectItem value="arquivo">Arquivo (PDF/DOCX)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "arquivo" ? (
            <div className="grid gap-2">
              <Label htmlFor="s-file">Arquivo</Label>
              <Input
                id="s-file"
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="s-content">{kind === "URL" ? "Endereço" : "Conteúdo"}</Label>
              {kind === "URL" ? (
                <Input
                  id="s-content"
                  type="url"
                  placeholder="https://..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              ) : (
                <Textarea
                  id="s-content"
                  rows={6}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!ready || create.isPending}>
              {create.isPending ? "Enviando..." : "Cadastrar fonte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
