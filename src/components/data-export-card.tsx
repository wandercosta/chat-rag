import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL } from "@/lib/api-client";
import { useSession } from "@/lib/session";

/**
 * Exportacao LGPD (etapa 8): baixa em JSON tudo o que a organizacao guarda
 * sobre pessoas. Fica na auditoria como evento de seguranca.
 */
export function DataExportCard({ tenantId }: { tenantId: string | null }) {
  const { profile } = useSession();
  const [busy, setBusy] = useState(false);
  if (profile !== "Administrador" || !tenantId) return null;

  async function download() {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/organizations/${tenantId}/export`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error();
      const name =
        response.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? "dados.json";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Não foi possível exportar os dados");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exportar dados (LGPD)</CardTitle>
        <CardDescription>
          Um arquivo JSON com quem acessa o painel, os contatos (com canais e etiquetas), as
          conversas com as mensagens e as notas internas. Chaves e senhas nunca entram. A exportação
          fica registrada na auditoria.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" disabled={busy} onClick={() => void download()}>
          <Download />
          {busy ? "Gerando…" : "Baixar dados da organização"}
        </Button>
      </CardContent>
    </Card>
  );
}
