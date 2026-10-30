import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, MessageSquare, Phone, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { HumanInboxCard } from "@/components/human-inbox-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  assistantsApi,
  collectionsApi,
  handoffApi,
  modelsApi,
  type Assistant,
  type WidgetSettings,
} from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/assistentes/$assistantId")({
  head: () => ({
    meta: [
      { title: "Assistente — ChatRAG" },
      { name: "description", content: "Identidade, modelo e retenção do assistente." },
      { property: "og:title", content: "Configuração do assistente — ChatRAG" },
      {
        property: "og:description",
        content: "Edite nome, modelo, instruções e retenção do assistente.",
      },
    ],
  }),
  component: AssistantDetail,
});

const retentionOptions = [
  { value: "0", label: "Não reter" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
];

function AssistantDetail() {
  const { assistantId } = Route.useParams();
  const { can, tenantId } = useSession();
  const readOnly = !can("write");
  const queryClient = useQueryClient();

  const assistantQuery = useQuery({
    queryKey: ["assistant", tenantId, assistantId],
    queryFn: () => assistantsApi.get(tenantId!, assistantId),
    enabled: !!tenantId,
  });

  const modelsQuery = useQuery({
    queryKey: ["allowed-models", tenantId],
    queryFn: () => modelsApi.listAllowed(tenantId!),
    enabled: !!tenantId,
  });

  const [name, setName] = useState("");
  const [modelId, setModelId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [status, setStatus] = useState<Assistant["status"]>("rascunho");
  const [retentionDays, setRetentionDays] = useState<string>("90");

  useEffect(() => {
    if (!assistantQuery.data) return;
    setName(assistantQuery.data.name);
    setModelId(assistantQuery.data.model_id);
    setInstructions(assistantQuery.data.instructions ?? "");
    setStatus(assistantQuery.data.status);
    setRetentionDays(String(assistantQuery.data.retention_days ?? 90));
  }, [assistantQuery.data]);

  const updateAssistant = useMutation({
    mutationFn: () =>
      assistantsApi.update(tenantId!, assistantId, {
        name,
        modelId,
        instructions: instructions || null,
        status,
        retentionDays: retentionDays === "0" ? null : Number(retentionDays),
      }),
    onSuccess: (updated) => {
      toast.success("Configuração salva");
      queryClient.setQueryData(["assistant", tenantId, assistantId], updated);
      queryClient.invalidateQueries({ queryKey: ["assistants", tenantId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o assistente");
    },
  });

  if (assistantQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  if (assistantQuery.isError) {
    return <p className="text-sm text-destructive">Assistente não encontrado.</p>;
  }

  const assistant = assistantQuery.data;
  if (!assistant) return null;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/assistentes">
          <ArrowLeft /> Assistentes
        </Link>
      </Button>
      <PageHeader
        title={assistant.name}
        description={`Modelo ${assistant.model_id} · atualizado em ${new Date(assistant.updated_at).toLocaleDateString("pt-BR")}`}
        actions={
          <>
            <StatusBadge status={assistant.status} className="h-9 px-3 text-sm" />
            <Button
              disabled={readOnly || updateAssistant.isPending || !name || !modelId}
              onClick={() => updateAssistant.mutate()}
            >
              <Save /> {updateAssistant.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      />
      <ActivationBanner context="respostas do assistente" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identidade</CardTitle>
            <CardDescription>Como o assistente se apresenta ao visitante.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="a-name">Nome</Label>
              <Input
                id="a-name"
                value={name}
                disabled={readOnly}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-model">Modelo</Label>
              <Select value={modelId} onValueChange={setModelId} disabled={readOnly}>
                <SelectTrigger id="a-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelsQuery.data?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} {m.note ? `· ${m.note}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as Assistant["status"])}
                disabled={readOnly}
              >
                <SelectTrigger id="a-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="publicado">Publicado</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-instr">Instruções (opcional)</Label>
              <Textarea
                id="a-instr"
                rows={5}
                disabled={readOnly}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Tom de voz, escopo de atendimento, o que evitar…"
              />
            </div>
          </CardContent>
        </Card>

        <KnowledgeScopeCard tenantId={tenantId} assistantId={assistantId} readOnly={readOnly} />

        <HumanInboxCard
          tenantId={tenantId}
          assistant={assistant}
          readOnly={readOnly}
          onSaved={(updated) =>
            queryClient.setQueryData(["assistant", tenantId, assistantId], updated)
          }
        />

        <HandoffConfigCard tenantId={tenantId} assistantId={assistantId} readOnly={readOnly} />

        <WidgetAppearanceCard
          tenantId={tenantId}
          assistant={assistant}
          readOnly={readOnly}
          onSaved={(updated) =>
            queryClient.setQueryData(["assistant", tenantId, assistantId], updated)
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retenção</CardTitle>
            <CardDescription>
              Por quanto tempo o histórico de conversas deste assistente fica guardado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="a-ret">Retenção de histórico</Label>
              <Select value={retentionDays} onValueChange={setRetentionDays} disabled={readOnly}>
                <SelectTrigger id="a-ret">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {retentionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sem um valor aqui, vale a retenção da organização (e, na falta dela, 90 dias).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const DEFAULT_ACCENT = "#5B4FE9";

/**
 * Aparencia do widget publico. O widget busca estes valores em
 * POST /widget/config ao carregar; um atributo data-* no <script> do site
 * hospedeiro ainda sobrescreve o campo correspondente.
 */
function WidgetAppearanceCard({
  tenantId,
  assistant,
  readOnly,
  onSaved,
}: {
  tenantId: string | null;
  assistant: Assistant;
  readOnly: boolean;
  onSaved: (updated: Assistant) => void;
}) {
  const [settings, setSettings] = useState<WidgetSettings>(assistant.widget_settings ?? {});

  useEffect(() => setSettings(assistant.widget_settings ?? {}), [assistant.widget_settings]);

  const set = <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value || undefined }));

  const save = useMutation({
    mutationFn: () => assistantsApi.update(tenantId!, assistant.id, { widgetSettings: settings }),
    onSuccess: (updated) => {
      toast.success("Aparência do widget salva");
      onSaved(updated);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar a aparência");
    },
  });

  const accent = settings.accentColor ?? DEFAULT_ACCENT;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Widget</CardTitle>
          <CardDescription>
            Aparência do chat embutido nos sites. Atributos <code>data-*</code> do script
            sobrescrevem estes valores.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={readOnly || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save /> {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="widget-title">Título</Label>
          <Input
            id="widget-title"
            maxLength={60}
            placeholder="Fale com a gente"
            value={settings.title ?? ""}
            disabled={readOnly}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="widget-accent">Cor de destaque</Label>
          <div className="flex gap-2">
            <Input
              id="widget-accent"
              type="color"
              className="w-14 p-1"
              value={accent}
              disabled={readOnly}
              onChange={(e) => set("accentColor", e.target.value)}
            />
            <Input value={accent} readOnly className="font-mono" aria-label="Cor em hexadecimal" />
          </div>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="widget-greeting">Saudação</Label>
          <Textarea
            id="widget-greeting"
            rows={2}
            maxLength={300}
            placeholder="Olá! Como posso ajudar?"
            value={settings.greeting ?? ""}
            disabled={readOnly}
            onChange={(e) => set("greeting", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Posição</Label>
          <Select
            value={settings.position ?? "bottom-right"}
            disabled={readOnly}
            onValueChange={(v) => set("position", v as WidgetSettings["position"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom-right">Canto inferior direito</SelectItem>
              <SelectItem value="bottom-left">Canto inferior esquerdo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tema</Label>
          <Select
            value={settings.theme ?? "light"}
            disabled={readOnly}
            onValueChange={(v) => set("theme", v as WidgetSettings["theme"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Claro</SelectItem>
              <SelectItem value="dark">Escuro</SelectItem>
              <SelectItem value="sync">Seguir o sistema do visitante</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Vinculo assistente ↔ colecao. Segue o ADR-003: nenhuma colecao marcada
 * significa "toda a base da organizacao"; marcar restringe aos topicos
 * daquelas colecoes.
 */
function KnowledgeScopeCard({
  tenantId,
  assistantId,
  readOnly,
}: {
  tenantId: string | null;
  assistantId: string;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();

  const collectionsQuery = useQuery({
    queryKey: ["collections", tenantId],
    queryFn: () => collectionsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const linkedQuery = useQuery({
    queryKey: ["assistant-collections", tenantId, assistantId],
    queryFn: () => collectionsApi.listForAssistant(tenantId!, assistantId),
    enabled: !!tenantId,
  });

  const toggle = useMutation({
    mutationFn: ({ collectionId, link }: { collectionId: string; link: boolean }) =>
      link
        ? collectionsApi.link(tenantId!, assistantId, collectionId)
        : collectionsApi.unlink(tenantId!, assistantId, collectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-collections", tenantId, assistantId] });
      toast.success("Escopo de conhecimento atualizado");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível atualizar o escopo"),
  });

  const collections = collectionsQuery.data ?? [];
  const linkedIds = new Set((linkedQuery.data ?? []).map((c) => c.id));
  const unrestricted = linkedIds.size === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Base de conhecimento</CardTitle>
        <CardDescription>Coleções que este assistente pode consultar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unrestricted && (
          <div className="rounded-md border border-dashed p-3">
            <Badge variant="outline" className="mb-1">
              Sem restrição
            </Badge>
            <p className="text-xs text-muted-foreground">
              Nenhuma coleção marcada — o assistente consulta toda a base da organização. Marque uma
              ou mais para restringir.
            </p>
          </div>
        )}

        {collectionsQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {collectionsQuery.isSuccess && collections.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma coleção cadastrada. Crie coleções em Base de conhecimento para poder restringir
            o escopo.
          </p>
        )}

        <div className="space-y-2">
          {collections.map((c) => (
            <label key={c.id} className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                checked={linkedIds.has(c.id)}
                disabled={readOnly || toggle.isPending}
                onCheckedChange={(v) => toggle.mutate({ collectionId: c.id, link: v === true })}
              />
              <span className="text-sm">
                <span className="font-medium">{c.name}</span>
                {c.description && (
                  <span className="block text-xs text-muted-foreground">{c.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Configuração dos setores e números de WhatsApp para encaminhamento a atendente humano.
 */
function HandoffConfigCard({
  tenantId,
  assistantId,
  readOnly,
}: {
  tenantId: string | null;
  assistantId: string;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [sectorName, setSectorName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const configsQuery = useQuery({
    queryKey: ["handoff-configs", tenantId, assistantId],
    queryFn: () => handoffApi.list(tenantId!, assistantId),
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      handoffApi.create(tenantId!, assistantId, {
        sectorName,
        phoneNumber,
      }),
    onSuccess: () => {
      toast.success("Setor de WhatsApp adicionado!");
      setSectorName("");
      setPhoneNumber("");
      setIsDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["handoff-configs", tenantId, assistantId] });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível cadastrar o número de WhatsApp",
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (configId: string) => handoffApi.remove(tenantId!, assistantId, configId),
    onSuccess: () => {
      toast.success("Setor removido");
      queryClient.invalidateQueries({ queryKey: ["handoff-configs", tenantId, assistantId] });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível remover o setor de WhatsApp",
      );
    },
  });

  const configs = configsQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-500" />
            Atendimento Humano no WhatsApp
          </CardTitle>
          <CardDescription>
            Cadastre os setores e números de WhatsApp para os visitantes falarem direto com
            atendentes humanos.
          </CardDescription>
        </div>
        {!readOnly && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Adicionar Setor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Cadastrar Número de WhatsApp</DialogTitle>
                <DialogDescription>
                  Informe o nome do setor/departamento e o número do WhatsApp com DDD.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (sectorName.trim() && phoneNumber.trim()) {
                    createMutation.mutate();
                  }
                }}
                className="space-y-4 pt-2"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="h-sector">Nome do Setor / Departamento</Label>
                  <Input
                    id="h-sector"
                    placeholder="ex: Suporte Técnico, Comercial, Financeiro"
                    value={sectorName}
                    onChange={(e) => setSectorName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="h-phone">Número de WhatsApp (com DDD)</Label>
                  <Input
                    id="h-phone"
                    placeholder="ex: 5511999998888 ou (11) 99999-8888"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Link gerado automaticamente:{" "}
                    <code className="rounded bg-muted px-1">https://wa.me/5511...</code>
                  </p>
                </div>
                <DialogFooter className="pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!sectorName.trim() || !phoneNumber.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? "Cadastrando..." : "Cadastrar WhatsApp"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {configsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando setores…</p>
        )}
        {configsQuery.isSuccess && configs.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Nenhum número de WhatsApp cadastrado para este assistente.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sem setores aqui, o botão de atendimento humano no widget ficará desativado.
            </p>
          </div>
        )}

        {configs.length > 0 && (
          <div className="space-y-2">
            {configs.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border p-3 bg-card"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{c.sector_name}</span>
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 text-emerald-600 bg-emerald-500/5 text-[10px]"
                    >
                      WhatsApp Web
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {c.phone_number}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                    title="Testar link do WhatsApp"
                    onClick={() => {
                      const digits = c.phone_number.replace(/[^\d]/g, "");
                      window.open(
                        `https://wa.me/${digits}?text=${encodeURIComponent("Olá! Vim através do site.")}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  {!readOnly && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate(c.id)}
                      title="Remover setor"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {configs.length > 1 && (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
            👉 <strong>Múltiplos setores cadastrados:</strong> Ao clicar no botão de WhatsApp no
            chat, o widget mostrará automaticamente os botões para o visitante escolher com qual
            setor deseja falar ({configs.map((c) => `"${c.sector_name}"`).join(", ")}).
          </div>
        )}
        {configs.length === 1 && (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
            👉 <strong>Setor único cadastrado:</strong> Ao clicar em WhatsApp no chat, o visitante
            será redirecionado direto para o WhatsApp Web do setor{" "}
            <strong>&quot;{configs[0].sector_name}&quot;</strong>.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
