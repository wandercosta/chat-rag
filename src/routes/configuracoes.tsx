import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { DataExportCard } from "@/components/data-export-card";
import { WidgetDefaultsCard } from "@/components/widget/widget-defaults-card";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/session";
import {
  ApiError,
  aiCredentialsApi,
  modelsApi,
  organizationsApi,
  platformApi,
  sourcesApi,
  type CredentialEnvironment,
  type CredentialStatus,
} from "@/lib/api-client";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — ChatRAG" },
      {
        name: "description",
        content: "Estado das chaves de IA por ambiente, modelos permitidos e retenção.",
      },
      { property: "og:title", content: "Configurações — ChatRAG" },
      {
        property: "og:description",
        content: "Configure a organização sem nunca exibir valores de chave.",
      },
    ],
  }),
  component: SettingsPage,
});

const statusLabel: Record<CredentialStatus["status"], string> = {
  ausente: "não configurada",
  valida: "válida",
  invalida: "inválida",
  substituida: "substituída",
  removida: "removida",
};

// "ambos" cobre teste e produção com a mesma credencial; o backend resolve a
// precedência (ambiente específico primeiro, depois 'ambos').
const environments: { value: CredentialEnvironment; label: string; hint: string }[] = [
  {
    value: "ambos",
    label: "Compartilhada (teste e produção)",
    hint: "Uma única chave atende os dois ambientes.",
  },
  {
    value: "teste",
    label: "Teste",
    hint: "Usada pelo playground e por chaves de widget de teste.",
  },
  { value: "producao", label: "Produção", hint: "Usada pelo widget publicado." },
];

const retentionOptions = [
  { value: "0", label: "Não reter" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
];

function SettingsPage() {
  const { can, tenantId } = useSession();

  if (!can("settings")) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Seu perfil não acessa configurações.
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Configurações" description="Ajustes da organização ativa." />
      <ActivationBanner />
      <PlatformAiCard />
      <AiCredentialsCard tenantId={tenantId} />
      <div className="grid gap-6 lg:grid-cols-2">
        <AllowedModelsCard tenantId={tenantId} />
        <RetentionCard tenantId={tenantId} />
      </div>
      <WidgetDefaultsCard tenantId={tenantId} />
      <DataExportCard tenantId={tenantId} />
    </>
  );
}

function AiCredentialsCard({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [environment, setEnvironment] = useState<CredentialEnvironment>("ambos");
  const [apiKey, setApiKey] = useState("");

  const statusQuery = useQuery({
    queryKey: ["ai-credentials", tenantId],
    queryFn: () => aiCredentialsApi.getStatus(tenantId!),
    enabled: !!tenantId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ai-credentials", tenantId] });
    // A ativação da base depende da chave: fontes travadas em
    // 'aguardando_ativacao' passam a poder ser enfileiradas.
    queryClient.invalidateQueries({ queryKey: ["sources"] });
  };

  const configure = useMutation({
    mutationFn: async () => {
      const result = await aiCredentialsApi.configure(tenantId!, environment, apiKey);
      // Fontes cadastradas antes da chave ficam em "aguardando ativação" e nao
      // sairiam de la sozinhas; a chave valida e justamente o gatilho.
      const activation =
        result.status === "valida" ? await sourcesApi.activatePending(tenantId!) : { activated: 0 };
      return { ...result, activated: activation.activated };
    },
    onSuccess: (result) => {
      setApiKey("");
      invalidate();
      if (result.status !== "valida") {
        toast.error("A chave foi salva, mas a OpenAI recusou a validação. Confira o valor.");
        return;
      }
      toast.success(
        result.activated > 0
          ? `Chave validada (${result.masked}). ${result.activated} fonte(s) enviada(s) para indexação.`
          : `Chave validada e salva (${result.masked})`,
      );
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar a chave"),
  });

  const remove = useMutation({
    mutationFn: (env: CredentialEnvironment) => aiCredentialsApi.remove(tenantId!, env),
    onSuccess: () => {
      invalidate();
      toast.success("Chave removida");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível remover a chave"),
  });

  const configured = (statusQuery.data ?? []).filter(
    (c) => c.status !== "ausente" && c.status !== "removida",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chave de IA (OpenAI)</CardTitle>
        <CardDescription>
          O valor salvo nunca é exibido novamente — apenas o estado e o final mascarado. Cole um
          novo valor para substituir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          {statusQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando estado…</p>
          )}
          {statusQuery.isSuccess && configured.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma chave configurada ainda.</p>
          )}
          {configured.map((c) => (
            <div
              key={c.environment}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium capitalize">{c.environment}</span>
                <StatusBadge status={statusLabel[c.status]} />
                {c.masked && (
                  <span className="font-mono text-xs text-muted-foreground">{c.masked}</span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(c.environment)}
              >
                Remover
              </Button>
            </div>
          ))}
        </div>

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            configure.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="k-env">Ambiente</Label>
            <Select
              value={environment}
              onValueChange={(v) => setEnvironment(v as CredentialEnvironment)}
            >
              <SelectTrigger id="k-env">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {environments.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {environments.find((e) => e.value === environment)?.hint}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="k-value">Nova chave</Label>
            <div className="flex gap-2">
              <Input
                id="k-value"
                type="password"
                autoComplete="off"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button type="submit" disabled={apiKey.trim().length < 20 || configure.isPending}>
                {configure.isPending ? "Validando..." : "Salvar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A chave é testada contra a OpenAI antes de ser marcada como válida.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AllowedModelsCard({ tenantId }: { tenantId: string | null }) {
  const modelsQuery = useQuery({
    queryKey: ["allowed-models", tenantId],
    queryFn: () => modelsApi.listAllowed(tenantId!),
    enabled: !!tenantId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Modelos permitidos</CardTitle>
        <CardDescription>Somente leitura — definido pelo Master da plataforma.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {modelsQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {modelsQuery.isSuccess && modelsQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum modelo liberado ainda. Peça ao Master para liberar ao menos um.
          </p>
        )}
        {modelsQuery.data?.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <span className="font-mono text-xs">{m.label}</span>
            {m.note && <Badge variant="outline">{m.note}</Badge>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RetentionCard({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState("90");
  const [mode, setMode] = useState<"excluir" | "anonimizar">("excluir");

  const orgQuery = useQuery({
    queryKey: ["organization", tenantId],
    queryFn: () => organizationsApi.getMine(tenantId!),
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!orgQuery.data) return;
    setDays(String(orgQuery.data.retention_days ?? 0));
    setMode(orgQuery.data.retention_mode ?? "excluir");
  }, [orgQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      organizationsApi.setRetention(tenantId!, days === "0" ? null : Number(days), mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", tenantId] });
      toast.success("Retenção atualizada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar a retenção"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Retenção de conversas</CardTitle>
        <CardDescription>Padrão da organização; cada assistente pode sobrescrever.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="s-ret">Manter histórico por</Label>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger id="s-ret">
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
            "Não reter" deixa a organização sem política própria — vale o padrão da plataforma (90
            dias).
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="s-ret-mode">Ao vencer o prazo</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <SelectTrigger id="s-ret-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excluir">Excluir a conversa</SelectItem>
              <SelectItem value="anonimizar">Anonimizar (manter só para métricas)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Anonimizar apaga o texto das mensagens, anexos e notas internas e desliga a conversa
            do visitante e do contato; contagens e tempos continuam no Desempenho.
          </p>
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando..." : "Salvar retenção"}
        </Button>
      </CardContent>
    </Card>
  );
}

const PROVIDER_LABEL = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  local: "Modo local (sem LLM)",
  hash: "Hashing de termos",
} as const;

/** IA definida no .env do deploy (ADR-005). So leitura: nunca mostra chaves. */
function PlatformAiCard() {
  const query = useQuery({ queryKey: ["platform-ai"], queryFn: () => platformApi.ai() });
  if (!query.data) return null;
  const ai = query.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">IA da plataforma</CardTitle>
        <CardDescription>
          Definida no <code>.env</code> do servidor. Uma chave OpenAI cadastrada abaixo tem
          prioridade para assistentes com modelos da OpenAI.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-sm">
        <Badge variant="outline">
          Chat: {PROVIDER_LABEL[ai.chatProvider]}
          {ai.chatModel ? ` · ${ai.chatModel}` : ""}
        </Badge>
        <Badge variant="outline">
          Embeddings:{" "}
          {ai.embeddingProvider === "local"
            ? "modelo multilíngue local"
            : PROVIDER_LABEL[ai.embeddingProvider]}
        </Badge>
      </CardContent>
    </Card>
  );
}
