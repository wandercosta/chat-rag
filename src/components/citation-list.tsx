import { FileText } from "lucide-react";
import type { Citation } from "@/lib/api-client";

/** Documento de origem + trecho que embasaram uma resposta do assistente. */
export function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Fontes
      </span>
      {citations.map((c) => (
        <details
          key={`${c.sourceId}-${c.index}`}
          className="rounded-md border bg-background px-2 py-1"
        >
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary">
            <FileText className="size-3.5 shrink-0" />[{c.index}] {c.sourceTitle}
          </summary>
          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {c.excerpt}
          </p>
        </details>
      ))}
    </div>
  );
}
