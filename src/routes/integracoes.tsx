import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError, assistantsApi, widgetKeysApi } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações e widget — ChatRAG" },
      { name: "description", content: "Script de instalação, chaves por ambiente com domínios permitidos e preview do widget." },
      { property: "og:title", content: "Integrações e widget — ChatRAG" },
      { property: "og:description", content: "Instale o widget do ChatRAG em sites externos." },
    ],
  }),
  component: IntegrationsPage,
});

function buildSnippet(key: string) {
  return `<script src="https://cdn.chatrag.io/chat-widget.js"\n  data-key="${key}"\n  data-mode="floating"\n  async></script>`;
}

function IntegrationsPage() {
  const { can, tenantId } = useSession();
  const queryClient = useQueryClient();
  const writable = can("integrations") && can("write");
  // O valor em texto puro so existe na resposta da criacao; guardamos em
  // memoria para o usuario copiar o script antes de sair da tela.
  const [freshKey, setFreshKey] = useState<{ masked: string; plaintext: string } | null>(null);

  const keysQuery = useQuery({
    queryKey: ["widget-keys", tenantId],
    queryFn: () => widgetKeysApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const revoke = useMutation({
    mutationFn: (keyId: string) => widgetKeysApi.revoke(tenantId!, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-keys", tenantId] });
      toast.success("Chave revogada");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível revogar a chave"),
  });

  const keys = keysQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Integrações e widget"
        description="Instale o assistente em sites externos."
        actions={writable && <NewKeyDialog tenantId={tenantId} onCreated={setFreshKey} />}
      />
      <ActivationBanner context="widget publicado" />

      {freshKey && (
        <Card className="border-success/40 bg-success/5">
          <CardHeader>
            <CardTitle className="text-base">Script de instalação</CardTitle>
            <CardDescription>
              Esta é a única vez que a chave aparece por extenso — copie agora. Cole antes do fechamento de
              &lt;/body&gt; no site hospedeiro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="overflow-x-auto rounded-md border bg-muted/60 p-3 font-mono text-xs">
              {buildSnippet(freshKey.plaintext)}
            </pre>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(buildSnippet(freshKey.plaintext));
                  toast.success("Script copiado");
                }}
              >
                <Copy /> Copiar script
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFreshKey(null)}>
                Já copiei, ocultar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        {keysQuery.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
        {keysQuery.isSuccess && keys.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            Nenhuma chave de widget ainda. Crie uma para gerar o script de instalação.
          </p>
        )}
        {keys.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ambiente</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {k.environment}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{k.masked}</TableCell>
                  <TableCell>
                    {k.revoked_at ? (
                      <Badge variant="outline" className="border-destructive/30 text-destructive">
                        revogada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-success/30 text-success">
                        ativa
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(k.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!writable || !!k.revoked_at || revoke.isPending}
                      onClick={() => revoke.mutate(k.id)}
                    >
                      <ShieldOff /> Revogar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function NewKeyDialog({
  tenantId,
  onCreated,
}: {
  tenantId: string | null;
  onCreated: (key: { masked: string; plaintext: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assistantId, setAssistantId] = useState("");
  const [environment, setEnvironment] = useState<"teste" | "producao">("teste");
  const [domains, setDomains] = useState("");

  const assistantsQuery = useQuery({
    queryKey: ["assistants", tenantId],
    queryFn: () => assistantsApi.list(tenantId!),
    enabled: !!tenantId && open,
  });

  const parsedDomains = domains
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const create = useMutation({
    mutationFn: () => widgetKeysApi.create(tenantId!, { assistantId, environment, domains: parsedDomains }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["widget-keys", tenantId] });
      onCreated({ masked: result.masked, plaintext: result.plaintext });
      setOpen(false);
      setAssistantId("");
      setDomains("");
      toast.success("Chave criada — copie o script agora");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível criar a chave"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Nova chave
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova chave de widget</DialogTitle>
          <DialogDescription>
            A chave só funciona nos domínios informados. O valor por extenso aparece uma única vez, na criação.
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
            <Label htmlFor="w-assistant">Assistente</Label>
            <Select value={assistantId} onValueChange={setAssistantId}>
              <SelectTrigger id="w-assistant">
                <SelectValue placeholder="Selecione o assistente" />
              </SelectTrigger>
              <SelectContent>
                {assistantsQuery.data?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="w-env">Ambiente</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as "teste" | "producao")}>
              <SelectTrigger id="w-env">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teste">Teste</SelectItem>
                <SelectItem value="producao">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="w-domains">Domínios permitidos</Label>
            <Input
              id="w-domains"
              placeholder="localhost, meusite.com.br"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Separados por vírgula, sem http:// e sem porta. Ao menos um é obrigatório.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!assistantId || parsedDomains.length === 0 || create.isPending}>
              {create.isPending ? "Criando..." : "Criar chave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
