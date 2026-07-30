import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, assistantsApi, gapsApi, topicsApi, type KnowledgeGap } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/lacunas")({
  head: () => ({
    meta: [
      { title: "Lacunas e feedbacks — ChatRAG" },
      { name: "description", content: "Perguntas sem resposta na base, frequência e status de resolução." },
      { property: "og:title", content: "Lacunas e feedbacks — ChatRAG" },
      { property: "og:description", content: "Priorize o que falta na base de conhecimento." },
    ],
  }),
  component: GapsPage,
});

function GapsPage() {
  const { profile, tenantId } = useSession();
  const readOnly = profile === "Analista";
  const queryClient = useQueryClient();
  const [answering, setAnswering] = useState<KnowledgeGap | null>(null);

  const gapsQuery = useQuery({
    queryKey: ["gaps", tenantId],
    queryFn: () => gapsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const assistantsQuery = useQuery({
    queryKey: ["assistants", tenantId],
    queryFn: () => assistantsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const assistantNames = new Map((assistantsQuery.data ?? []).map((a) => [a.id, a.name]));

  const resolveMutation = useMutation({
    mutationFn: (gapId: string) => gapsApi.resolve(tenantId!, gapId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gaps", tenantId] });
      toast.success("Lacuna marcada como resolvida");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Falha ao resolver lacuna"),
  });

  return (
    <>
      <PageHeader title="Lacunas e feedbacks" description="Perguntas que a base atual não respondeu." />
      <Card className="overflow-hidden p-0">
        {gapsQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        ) : gapsQuery.isError ? (
          <p className="p-6 text-sm text-destructive">Falha ao carregar lacunas.</p>
        ) : gapsQuery.data && gapsQuery.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pergunta</TableHead>
                <TableHead>Frequência</TableHead>
                <TableHead>Assistente</TableHead>
                <TableHead>Última ocorrência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {gapsQuery.data.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="max-w-md font-medium">{g.question_normalized}</TableCell>
                  <TableCell className="tabular-nums">{g.frequency}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {assistantNames.get(g.assistant_id) ?? g.assistant_id}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(g.last_seen_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={g.status} />
                  </TableCell>
                  <TableCell className="flex justify-end gap-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={readOnly || g.status === "resolvida"}
                      onClick={() => setAnswering(g)}
                    >
                      <Sparkles /> Responder
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={readOnly || g.status === "resolvida"}
                      onClick={() => resolveMutation.mutate(g.id)}
                    >
                      <Check /> Marcar resolvida
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma lacuna registrada até agora.</p>
        )}
      </Card>

      <AnswerGapDialog
        gap={answering}
        tenantId={tenantId}
        onClose={() => setAnswering(null)}
        onAnswered={() => {
          setAnswering(null);
          queryClient.invalidateQueries({ queryKey: ["gaps", tenantId] });
        }}
      />
    </>
  );
}

function AnswerGapDialog({
  gap,
  tenantId,
  onClose,
  onAnswered,
}: {
  gap: KnowledgeGap | null;
  tenantId: string | null;
  onClose: () => void;
  onAnswered: () => void;
}) {
  const [topicId, setTopicId] = useState("");
  const [content, setContent] = useState("");

  const topicsQuery = useQuery({
    queryKey: ["topics", tenantId],
    queryFn: () => topicsApi.list(tenantId!),
    enabled: !!tenantId && !!gap,
  });

  const answerMutation = useMutation({
    mutationFn: () => gapsApi.answer(tenantId!, gap!.id, { topicId, content }),
    onSuccess: () => {
      toast.success("Resposta salva como fonte de conhecimento e lacuna resolvida");
      setTopicId("");
      setContent("");
      onAnswered();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Falha ao responder lacuna"),
  });

  return (
    <Dialog
      open={!!gap}
      onOpenChange={(open) => {
        if (!open) {
          setTopicId("");
          setContent("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Responder lacuna</DialogTitle>
          <DialogDescription>
            A resposta vira uma fonte de texto na base (mesmo pipeline de indexação de qualquer outra
            fonte) e a lacuna é marcada como resolvida.
          </DialogDescription>
        </DialogHeader>

        {gap && (
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Pergunta</Label>
              <p className="mt-1 text-sm font-medium">{gap.question_normalized}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gap-topic">Tópico da base</Label>
              <Select value={topicId} onValueChange={setTopicId}>
                <SelectTrigger id="gap-topic">
                  <SelectValue placeholder="Selecione um tópico" />
                </SelectTrigger>
                <SelectContent>
                  {(topicsQuery.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {topicsQuery.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum tópico cadastrado ainda — crie um em Base de conhecimento antes de responder.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gap-content">Resposta</Label>
              <Textarea
                id="gap-content"
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escreva a resposta que deve alimentar a base para essa pergunta…"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!topicId || !content.trim() || answerMutation.isPending}
            onClick={() => answerMutation.mutate()}
          >
            Salvar e resolver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
