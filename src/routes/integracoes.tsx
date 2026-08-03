import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Code2, Copy, FileCode2, KeyRound, MonitorSmartphone, Plus, ShieldOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ApiError, assistantsApi, widgetKeysApi } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações e widget — ChatRAG" },
      {
        name: "description",
        content:
          "Script de instalação, chaves por ambiente com domínios permitidos e preview do widget.",
      },
      { property: "og:title", content: "Integrações e widget — ChatRAG" },
      { property: "og:description", content: "Instale o widget do ChatRAG em sites externos." },
    ],
  }),
  component: IntegrationsPage,
});

function getWidgetScriptUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/chat-widget.js`;
  }
  return "http://localhost:3000/chat-widget.js";
}

function buildSnippet(key: string) {
  return `<script src="${getWidgetScriptUrl()}"\n  data-key="${key}"\n  data-mode="floating"\n  async></script>`;
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
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível revogar a chave"),
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

      <InstallGuideCard />

      {freshKey && (
        <Card className="border-success/40 bg-success/5">
          <CardHeader>
            <CardTitle className="text-base">Script de instalação gerado</CardTitle>
            <CardDescription>
              Esta é a única vez que a chave aparece por extenso — copie agora. Cole antes do
              fechamento de &lt;/body&gt; no site hospedeiro.
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

      <ScriptBuilderCard freshKey={freshKey} />

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

// ---------------------------------------------------------------------------
// Guia de instalação — passo a passo visual para quem não é programador
// ---------------------------------------------------------------------------

function InstallGuideCard() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Como instalar o widget no seu site</CardTitle>
            <CardDescription>
              Siga os 3 passos abaixo para colocar o chat no ar. Não precisa de programador.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Passo 1 */}
          <div className="flex gap-3 rounded-lg border bg-background p-4">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              1
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                <p className="text-sm font-semibold">Crie uma chave</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Clique em <strong>Nova chave</strong> no topo desta página. Escolha o assistente e
                informe o domínio do seu site (ex.: <code className="rounded bg-muted px-1">meusite.com.br</code>).
              </p>
            </div>
          </div>

          {/* Passo 2 */}
          <div className="flex gap-3 rounded-lg border bg-background p-4">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              2
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5 text-primary" />
                <p className="text-sm font-semibold">Gere o código</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Use o <strong>Construtor de script</strong> abaixo para personalizar a aparência.
                O código é gerado automaticamente enquanto você preenche.
              </p>
            </div>
          </div>

          {/* Passo 3 */}
          <div className="flex gap-3 rounded-lg border bg-background p-4">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              3
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <FileCode2 className="h-3.5 w-3.5 text-primary" />
                <p className="text-sm font-semibold">Cole no seu site</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Copie o código gerado e cole no HTML do seu site, logo antes de{" "}
                <code className="rounded bg-muted px-1">&lt;/body&gt;</code>. O chat aparece
                automaticamente para seus visitantes.
              </p>
            </div>
          </div>
        </div>

        {/* Nota sobre segurança */}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-700 dark:text-amber-500">
            <strong>Importante:</strong> O widget só funciona nos domínios informados ao criar a
            chave. Se precisar usar em outro site, crie uma nova chave para ele. Nunca compartilhe
            sua chave — quem tiver acesso a ela pode usar o seu assistente em qualquer página.
          </p>
        </div>
      </CardContent>
    </Card>
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
    mutationFn: () =>
      widgetKeysApi.create(tenantId!, { assistantId, environment, domains: parsedDomains }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["widget-keys", tenantId] });
      onCreated({ masked: result.masked, plaintext: result.plaintext });
      setOpen(false);
      setAssistantId("");
      setDomains("");
      toast.success("Chave criada — copie o script agora");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível criar a chave"),
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
            A chave só funciona nos domínios informados. O valor por extenso aparece uma única vez,
            na criação.
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
            <Select
              value={environment}
              onValueChange={(v) => setEnvironment(v as "teste" | "producao")}
            >
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
            <Button
              type="submit"
              disabled={!assistantId || parsedDomains.length === 0 || create.isPending}
            >
              {create.isPending ? "Criando..." : "Criar chave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Construtor visual de script — permite montar e copiar o snippet sem precisar
// editar código. Preencha os campos e o script é gerado automaticamente.
// ---------------------------------------------------------------------------

type Mode = "floating" | "embedded";
type Position = "bottom-right" | "bottom-left";
type Theme = "light" | "dark" | "sync";

interface ScriptOptions {
  key: string;
  mode: Mode;
  position: Position;
  theme: Theme;
  title: string;
  greeting: string;
  accentColor: string;
  avatarUrl: string;
  showOnlineBadge: boolean;
}

function buildFullSnippet(opts: ScriptOptions): string {
  const lines = [`<script src="${getWidgetScriptUrl()}"`];
  lines.push(`  data-key="${opts.key}"`);
  lines.push(`  data-mode="${opts.mode}"`);
  if (opts.mode === "floating") lines.push(`  data-position="${opts.position}"`);
  lines.push(`  data-theme="${opts.theme}"`);
  if (opts.accentColor.trim()) lines.push(`  data-accent="${opts.accentColor.trim()}"`);
  if (opts.avatarUrl.trim()) lines.push(`  data-avatar="${opts.avatarUrl.trim()}"`);
  if (!opts.showOnlineBadge) lines.push(`  data-online="false"`);
  if (opts.title.trim()) lines.push(`  data-title="${opts.title.trim()}"`);
  if (opts.greeting.trim()) lines.push(`  data-greeting="${opts.greeting.trim()}"`);
  lines.push("  async");
  lines.push("></script>");
  return lines.join("\n");
}

function ScriptBuilderCard({
  freshKey,
}: {
  freshKey: { masked: string; plaintext: string } | null;
}) {
  const [key, setKey] = useState(freshKey?.plaintext ?? "");
  const [mode, setMode] = useState<Mode>("floating");
  const [position, setPosition] = useState<Position>("bottom-right");
  const [theme, setTheme] = useState<Theme>("sync");
  const [accentColor, setAccentColor] = useState("#5B4FE9");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showOnlineBadge, setShowOnlineBadge] = useState(true);
  const [title, setTitle] = useState("Fale com a gente");
  const [greeting, setGreeting] = useState("Olá! Como posso ajudar?");
  const [copied, setCopied] = useState(false);

  // Quando uma nova chave é criada, preenche automaticamente o campo
  useEffect(() => {
    if (freshKey?.plaintext) setKey(freshKey.plaintext);
  }, [freshKey?.plaintext]);

  const snippet = useMemo(
    () =>
      buildFullSnippet({
        key,
        mode,
        position,
        theme,
        accentColor,
        avatarUrl,
        showOnlineBadge,
        title,
        greeting,
      }),
    [key, mode, position, theme, accentColor, avatarUrl, showOnlineBadge, title, greeting],
  );

  function handleCopy() {
    navigator.clipboard?.writeText(snippet).then(() => {
      setCopied(true);
      toast.success("Script copiado! Cole antes do </body> no seu site.");
      setTimeout(() => setCopied(false), 3000);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Code2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Construtor de script</CardTitle>
            <CardDescription>
              Personalize as opções abaixo e copie o código pronto para colar no seu site.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Passo 1 — Chave */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              1
            </span>
            <Label className="font-medium">Chave do widget</Label>
          </div>
          <Input
            id="sb-key"
            placeholder="pk_live_... (gerada ao criar uma nova chave acima)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="font-mono text-xs"
          />
          {!key && (
            <p className="flex items-center gap-1 text-xs text-amber-600">
              <Sparkles className="h-3 w-3" />
              Crie uma chave de widget acima — ela será preenchida automaticamente aqui.
            </p>
          )}
        </div>

        {/* Passo 2 — Aparência */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              2
            </span>
            <Label className="font-medium">Aparência</Label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="sb-mode" className="text-xs text-muted-foreground">
                Modo
              </Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger id="sb-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="floating">Flutuante (botão no canto)</SelectItem>
                  <SelectItem value="embedded">Embutido (dentro da página)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "floating" && (
              <div className="space-y-1.5">
                <Label htmlFor="sb-position" className="text-xs text-muted-foreground">
                  Posição
                </Label>
                <Select value={position} onValueChange={(v) => setPosition(v as Position)}>
                  <SelectTrigger id="sb-position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Canto inferior direito</SelectItem>
                    <SelectItem value="bottom-left">Canto inferior esquerdo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="sb-theme" className="text-xs text-muted-foreground">
                Tema de cor
              </Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <SelectTrigger id="sb-theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sync">Igual ao site (automático)</SelectItem>
                  <SelectItem value="light">Claro</SelectItem>
                  <SelectItem value="dark">Escuro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Personalização Visual */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="sb-accent" className="text-xs text-muted-foreground">
                Cor Principal do Chat
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="sb-accent-color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-9 rounded border border-input bg-transparent p-0.5 cursor-pointer"
                />
                <Input
                  id="sb-accent"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="font-mono text-xs uppercase"
                  placeholder="#5B4FE9"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sb-avatar" className="text-xs text-muted-foreground">
                URL da Foto / Avatar do Assistente
              </Label>
              <Input
                id="sb-avatar"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://exemplo.com/foto-assistente.png"
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <Label htmlFor="sb-online" className="text-xs font-medium">
                Indicador de Status Online (● Online)
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Exibe um ponto verde brilhante com &quot;Online&quot; no topo do chat
              </p>
            </div>
            <Switch
              id="sb-online"
              checked={showOnlineBadge}
              onCheckedChange={setShowOnlineBadge}
            />
          </div>
        </div>

        {/* Passo 3 — Textos */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              3
            </span>
            <Label className="font-medium">Textos (opcional)</Label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sb-title" className="text-xs text-muted-foreground">
                Título do chat
              </Label>
              <Input
                id="sb-title"
                placeholder="Fale com a gente"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-greeting" className="text-xs text-muted-foreground">
                Mensagem de boas-vindas
              </Label>
              <Input
                id="sb-greeting"
                placeholder="Olá! Como posso ajudar?"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Resultado */}
        <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground">
              Código gerado — cole antes do{" "}
              <code className="rounded bg-muted px-1">&lt;/body&gt;</code> no seu site
            </Label>
            <Button
              size="sm"
              variant={copied ? "default" : "outline"}
              onClick={handleCopy}
              disabled={!key}
              className="gap-1.5"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copiar código
                </>
              )}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs leading-relaxed text-foreground">
            {key
              ? snippet
              : `<script src="${getWidgetScriptUrl()}"\n  data-key="(preencha a chave acima)"\n  ...\n></script>`}
          </pre>
          {!key && (
            <p className="text-center text-xs text-muted-foreground">
              Preencha a chave no passo 1 para ativar o código.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
