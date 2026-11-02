import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api-client";
import {
  WEBHOOK_EVENTS,
  developersApi,
  type Webhook,
  type WebhookEvent,
} from "@/lib/developers-api";
import { SecretReveal } from "./secret-reveal";

const statusVariant = {
  entregue: "secondary",
  pendente: "outline",
  falhou: "destructive",
} as const;

function Deliveries({ tenantId, webhookId }: { tenantId: string; webhookId: string }) {
  const query = useQuery({
    queryKey: ["webhook-deliveries", tenantId, webhookId],
    queryFn: () => developersApi.deliveries(tenantId, webhookId),
    refetchInterval: 5000,
  });
  if (!query.data?.length) {
    return <p className="text-xs text-muted-foreground">Nenhuma entrega ainda.</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {query.data.slice(0, 10).map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant[d.status]}>{d.status}</Badge>
          <span className="font-mono">{d.event}</span>
          <span className="text-muted-foreground">
            {new Date(d.created_at).toLocaleString("pt-BR")} · {d.attempts} tentativa(s)
            {d.last_error ? ` · ${d.last_error}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function WebhooksCard({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["mensagem.recebida"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["webhooks", tenantId],
    queryFn: () => developersApi.webhooks(tenantId),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["webhooks", tenantId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir");

  const create = useMutation({
    mutationFn: () => developersApi.createWebhook(tenantId, url.trim(), events),
    onSuccess: (hook) => {
      setSecret(hook.secret);
      setUrl("");
      refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (hook: Webhook) =>
      developersApi.setWebhookEnabled(tenantId, hook.id, !hook.enabled),
    onSuccess: refresh,
    onError,
  });
  const rotate = useMutation({
    mutationFn: (id: string) => developersApi.rotateSecret(tenantId, id),
    onSuccess: (r) => setSecret(r.secret),
    onError,
  });
  const test = useMutation({
    mutationFn: (id: string) => developersApi.testWebhook(tenantId, id),
    onSuccess: (_r, id) => {
      toast.success("Entrega de teste enviada");
      setOpen(id);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => developersApi.removeWebhook(tenantId, id),
    onSuccess: refresh,
    onError,
  });

  const toggleEvent = (id: WebhookEvent, on: boolean) =>
    setEvents((current) => (on ? [...current, id] : current.filter((e) => e !== id)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhooks</CardTitle>
        <CardDescription>
          Avisamos o seu sistema (POST em JSON, só https) quando algo acontece. Cada envio vem
          assinado no cabeçalho <code>X-ChatRAG-Signature</code> (HMAC-SHA256 com o segredo) e, se
          falhar, tentamos de novo por cerca de meia hora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {secret && (
          <SecretReveal
            label="Segredo de assinatura: copie agora, ele não aparece de novo."
            value={secret}
          />
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="webhook-url">URL</Label>
              <Input
                id="webhook-url"
                placeholder="https://seu-sistema.com/chatrag"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!url.trim() || events.length === 0 || create.isPending}>
              Adicionar
            </Button>
          </div>
          <div className="flex flex-wrap gap-4">
            {WEBHOOK_EVENTS.map((event) => (
              <label key={event.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={events.includes(event.id)}
                  onCheckedChange={(v) => toggleEvent(event.id, v === true)}
                />
                {event.label}
              </label>
            ))}
          </div>
        </form>

        <div className="divide-y rounded-md border">
          {listQuery.data?.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Nenhum webhook cadastrado.</p>
          )}
          {listQuery.data?.map((hook) => (
            <div key={hook.id} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Switch
                  checked={hook.enabled}
                  onCheckedChange={() => toggle.mutate(hook)}
                  aria-label="Ligar ou desligar"
                />
                <code className="min-w-0 flex-1 break-all">{hook.url}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpen(open === hook.id ? null : hook.id)}
                >
                  Entregas
                </Button>
                <Button size="sm" variant="ghost" onClick={() => test.mutate(hook.id)}>
                  Testar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => rotate.mutate(hook.id)}>
                  Trocar segredo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => confirm("Excluir este webhook?") && remove.mutate(hook.id)}
                >
                  Excluir
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {hook.events
                  .map((e) => WEBHOOK_EVENTS.find((x) => x.id === e)?.label ?? e)
                  .join(" · ")}
              </p>
              {open === hook.id && <Deliveries tenantId={tenantId} webhookId={hook.id} />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
