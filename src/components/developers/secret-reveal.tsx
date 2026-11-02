import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Token ou segredo mostrado uma unica vez, com botao de copiar. */
export function SecretReveal({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
      <p className="font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">
          {value}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copiado"))}
        >
          <Copy />
          Copiar
        </Button>
      </div>
    </div>
  );
}
