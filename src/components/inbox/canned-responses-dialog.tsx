import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { cannedResponsesApi } from "@/lib/inbox-api";

/** Respostas prontas da organizacao. So o administrador gerencia; quem atende
 * escolhe uma na hora de responder. */
export function CannedResponsesDialog({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const listQuery = useQuery({
    queryKey: ["canned-responses", tenantId],
    queryFn: () => cannedResponsesApi.list(tenantId!),
    enabled: !!tenantId,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["canned-responses", tenantId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar");

  const create = useMutation({
    mutationFn: () => cannedResponsesApi.create(tenantId!, { title, content }),
    onSuccess: () => {
      setTitle("");
      setContent("");
      void invalidate();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => cannedResponsesApi.remove(tenantId!, id),
    onSuccess: () => void invalidate(),
    onError,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MessageSquareText />
          Respostas prontas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Respostas prontas</DialogTitle>
          <DialogDescription>
            Textos que a equipe insere com um clique ao responder um visitante.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-60 space-y-2 overflow-y-auto">
          {listQuery.data?.length === 0 && (
            <li className="text-sm text-muted-foreground">Nenhuma resposta pronta ainda.</li>
          )}
          {listQuery.data?.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-md border p-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{r.content}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remover ${r.title}`}
                onClick={() => remove.mutate(r.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>

        <form
          className="space-y-3 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="canned-title">Título</Label>
            <Input
              id="canned-title"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="canned-content">Texto</Label>
            <Textarea
              id="canned-content"
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!title.trim() || !content.trim() || create.isPending}
            >
              Adicionar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
