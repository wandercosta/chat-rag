import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
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
import { ApiError } from "@/lib/api-client";
import { contactsApi, type ImportReport } from "@/lib/contacts-api";

/** Importacao de CSV: o arquivo e lido no navegador e vai como texto. */
export function ImportContactsDialog({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<ImportReport | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => contactsApi.importCsv(tenantId!, await file.text()),
    onSuccess: (result) => {
      setReport(result);
      void queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["contact-tags", tenantId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível importar"),
  });

  return (
    <Dialog onOpenChange={(open) => !open && setReport(null)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload />
          Importar CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar contatos</DialogTitle>
          <DialogDescription>
            Colunas reconhecidas: nome, email, telefone, etiquetas (separadas por |), opt_in
            (sim/não) e os campos personalizados pelo nome. É preciso e-mail ou telefone em cada
            linha; contatos que já existem são atualizados. Até 5 mil linhas por arquivo.
          </DialogDescription>
        </DialogHeader>

        <Input
          type="file"
          accept=".csv,text/csv"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
          }}
        />
        {upload.isPending && <p className="text-sm text-muted-foreground">Importando…</p>}

        {report && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{report.created}</strong> novos, <strong>{report.updated}</strong>{" "}
              atualizados, <strong>{report.errors.length}</strong> com erro.
            </p>
            {report.ignoredColumns.length > 0 && (
              <p className="text-muted-foreground">
                Colunas ignoradas: {report.ignoredColumns.join(", ")}
              </p>
            )}
            {report.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
                {report.errors.map((e) => (
                  <li key={e.line}>
                    Linha {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
