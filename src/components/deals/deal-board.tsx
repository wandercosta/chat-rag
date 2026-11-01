import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api-client";
import {
  dealsApi,
  formatCents,
  formatDate,
  type Deal,
  type Pipeline,
  type PipelineStage,
} from "@/lib/deals-api";

type Move = { dealId: string; stageId: string; position: number };

/** Mesma ordem que o servidor grava: tira o card e insere na posicao da coluna. */
function applyMove(deals: Deal[], move: Move, stage: PipelineStage): Deal[] {
  const moving = deals.find((d) => d.id === move.dealId);
  if (!moving) return deals;
  const status = stage.kind === "aberta" ? "aberto" : stage.kind === "ganho" ? "ganho" : "perdido";
  const others = deals.filter((d) => d.id !== move.dealId);
  const target = others
    .filter((d) => d.stageId === move.stageId)
    .sort((a, b) => a.position - b.position);
  target.splice(Math.min(move.position, target.length), 0, {
    ...moving,
    stageId: move.stageId,
    status,
  });
  return [
    ...others.filter((d) => d.stageId !== move.stageId),
    ...target.map((d, position) => ({ ...d, position })),
  ];
}

/**
 * Kanban do funil: arrastar o card entre colunas (ou pelo menu "Mover para",
 * que funciona sem mouse). Atualiza na hora e desfaz se o servidor recusar.
 */
export function DealBoard({
  tenantId,
  pipeline,
  deals,
  canWrite,
  onOpen,
}: {
  tenantId: string;
  pipeline: Pipeline;
  deals: Deal[];
  canWrite: boolean;
  onOpen: (dealId: string) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["deals", tenantId, pipeline.id];
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ stageId: string; position: number } | null>(null);

  const move = useMutation({
    mutationFn: (m: Move & { lostReason?: string | null }) =>
      dealsApi.move(tenantId, m.dealId, {
        stageId: m.stageId,
        position: m.position,
        lostReason: m.lostReason,
      }),
    onMutate: (m) => {
      const stage = pipeline.stages.find((s) => s.id === m.stageId)!;
      queryClient.setQueryData<Deal[]>(queryKey, (current) =>
        current ? applyMove(current, m, stage) : current,
      );
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível mover o negócio"),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["deals", tenantId] }),
  });

  function moveTo(dealId: string, stage: PipelineStage, position: number) {
    let lostReason: string | null | undefined;
    const deal = deals.find((d) => d.id === dealId);
    if (stage.kind === "perdido" && deal?.stageId !== stage.id) {
      const answer = window.prompt("Motivo da perda (opcional):", "");
      if (answer === null) return;
      lostReason = answer.trim() || null;
    }
    move.mutate({ dealId, stageId: stage.id, position, lostReason });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {pipeline.stages.map((stage) => {
        const column = deals
          .filter((d) => d.stageId === stage.id)
          .sort((a, b) => a.position - b.position);
        const total = column.reduce((sum, d) => sum + (d.valueCents ?? 0), 0);
        const dropAt = (position: number) => (e: React.DragEvent) => {
          if (!dragging || !canWrite) return;
          e.preventDefault();
          e.stopPropagation();
          setOver({ stageId: stage.id, position });
        };
        return (
          <section
            key={stage.id}
            aria-label={stage.name}
            className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/40 ${
              over?.stageId === stage.id ? "ring-2 ring-primary/40" : ""
            }`}
            onDragOver={dropAt(column.length)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging && over) moveTo(dragging, stage, over.position);
              setDragging(null);
              setOver(null);
            }}
          >
            <header className="flex items-baseline justify-between gap-2 px-3 py-2">
              <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {column.length}
                {total > 0 && ` · ${formatCents(total)}`}
              </span>
            </header>
            <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
              {column.map((deal, index) => (
                <li
                  key={deal.id}
                  draggable={canWrite}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(deal.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onDragOver={dropAt(index)}
                  className={`rounded-md border bg-card p-3 text-sm shadow-sm ${
                    dragging === deal.id ? "opacity-50" : ""
                  } ${over?.stageId === stage.id && over.position === index ? "border-t-2 border-t-primary" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left font-medium hover:underline"
                      onClick={() => onOpen(deal.id)}
                    >
                      {deal.title}
                    </button>
                    {canWrite && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0"
                            aria-label={`Mover ${deal.title}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Mover para</DropdownMenuLabel>
                          {pipeline.stages
                            .filter((s) => s.id !== stage.id)
                            .map((s) => (
                              <DropdownMenuItem
                                key={s.id}
                                onSelect={() =>
                                  moveTo(deal.id, s, deals.filter((d) => d.stageId === s.id).length)
                                }
                              >
                                {s.name}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {deal.contactLabel && (
                    <p className="truncate text-xs text-muted-foreground">{deal.contactLabel}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {deal.valueCents != null && (
                      <span className="font-medium text-foreground">
                        {formatCents(deal.valueCents)}
                      </span>
                    )}
                    {deal.expectedCloseDate && (
                      <span>até {formatDate(deal.expectedCloseDate)}</span>
                    )}
                    {deal.ownerEmail && (
                      <span className="truncate">{deal.ownerEmail.split("@")[0]}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
