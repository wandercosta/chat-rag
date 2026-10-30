import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ConnectChannelDialog } from "@/components/channels/connect-channel-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { channelLabel, channelsApi, type ChannelConnection } from "@/lib/channels-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/canais")({
  head: () => ({
    meta: [
      { title: "Canais — ChatRAG" },
      {
        name: "description",
        content:
          "Conecte WhatsApp, Instagram, Messenger e Telegram oficiais ao assistente e à caixa de entrada.",
      },
    ],
  }),
  component: ChannelsPage,
});

function ChannelsPage() {
  const { tenantId } = useSession();
  const listQuery = useQuery({
    queryKey: ["channels", tenantId],
    queryFn: () => channelsApi.list(tenantId!),
    enabled: !!tenantId,
  });

  return (
    <>
      <PageHeader
        title="Canais"
        description="Mensagens desses canais chegam ao assistente e, quando pedem atendente, à caixa de entrada. Só a API oficial de cada provedor é usada."
        actions={
          <>
            {(["whatsapp", "instagram", "messenger", "telegram"] as const).map((provider) => (
              <ConnectChannelDialog key={provider} tenantId={tenantId} provider={provider} />
            ))}
          </>
        }
      />
      {listQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {listQuery.data?.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum canal conectado ainda.</Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {listQuery.data?.map((c) => (
          <ConnectionCard key={c.id} tenantId={tenantId} connection={c} />
        ))}
      </div>
    </>
  );
}

/** Como a conta aparece: numero, Pagina ou @usuario. */
function accountLabel(c: ChannelConnection) {
  if (c.provider === "whatsapp") return c.config.displayPhone || c.external_id;
  if (c.provider === "messenger") return c.config.pageName || c.external_id;
  return c.config.username ? `@${c.config.username}` : c.external_id;
}

function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{value}</code>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Copiar ${label}`}
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copiado"))}
        >
          <Copy />
        </Button>
      </div>
    </div>
  );
}

function ConnectionCard({
  tenantId,
  connection: c,
}: {
  tenantId: string | null;
  connection: ChannelConnection;
}) {
  const queryClient = useQueryClient();
  const isWhatsApp = c.provider === "whatsapp";
  const templatesQuery = useQuery({
    queryKey: ["channel-templates", tenantId, c.id],
    queryFn: () => channelsApi.templates(tenantId!, c.id),
    enabled: !!tenantId && isWhatsApp,
  });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir");

  const check = useMutation({
    mutationFn: () => channelsApi.check(tenantId!, c.id),
    onSuccess: (r) => {
      if (r.status === "ativo") toast.success("Conexão funcionando");
      else toast.error(`A Meta recusou: ${r.detail}`);
      void queryClient.invalidateQueries({ queryKey: ["channels", tenantId] });
    },
    onError,
  });
  const sync = useMutation({
    mutationFn: () => channelsApi.syncTemplates(tenantId!, c.id),
    onSuccess: (list) => {
      toast.success(`${list.length} modelo(s) sincronizado(s)`);
      queryClient.setQueryData(["channel-templates", tenantId, c.id], list);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => channelsApi.remove(tenantId!, c.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["channels", tenantId] }),
    onError,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            {c.name}
            <Badge variant={c.status === "ativo" ? "secondary" : "destructive"}>{c.status}</Badge>
          </CardTitle>
          <CardDescription>
            {channelLabel[c.provider]} · {accountLabel(c)} · token {c.secret_hint}
          </CardDescription>
          {c.status_detail && <p className="text-xs text-destructive">{c.status_detail}</p>}
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Desconectar ${c.name}`}
          onClick={() => {
            if (window.confirm(`Desconectar ${c.name}? As conversas ficam no histórico.`))
              remove.mutate();
          }}
        >
          <Trash2 />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {c.provider === "telegram" ? (
          <p className="text-xs text-muted-foreground">
            O webhook é registrado sozinho no Telegram. Se o estado ficar em erro, confira se a API
            tem endereço público com HTTPS (PUBLIC_API_URL) e use “Testar conexão”.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Na Meta, cadastre o webhook com estes dados e assine o campo “messages”:
            </p>
            <CopyLine label="URL de retorno" value={c.webhookUrl} />
            <CopyLine label="Token de verificação" value={c.verify_token} />
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={check.isPending}
            onClick={() => check.mutate()}
          >
            Testar conexão
          </Button>
          {isWhatsApp && (
            <Button
              size="sm"
              variant="outline"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
            >
              <RefreshCw />
              Sincronizar modelos
            </Button>
          )}
        </div>

        {isWhatsApp && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Modelos de mensagem</p>
            {templatesQuery.data?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum modelo. Eles servem para falar com o cliente depois de 24 horas sem resposta.
              </p>
            )}
            {templatesQuery.data?.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <Badge variant="outline">{t.status}</Badge>
                <span className="font-medium">{t.name}</span>
                <span className="truncate text-muted-foreground">{t.body}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
