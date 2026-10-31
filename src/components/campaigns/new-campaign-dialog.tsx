import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { campaignsApi } from "@/lib/campaigns-api";
import { channelLabel, channelsApi } from "@/lib/channels-api";
import { contactTaxonomyApi } from "@/lib/contacts-api";

/**
 * Nova campanha (rascunho): canal, segmento e conteudo. O publico e mostrado
 * antes de criar, com quem fica de fora por falta de opt-in ou de canal.
 */
export function NewCampaignDialog({ tenantId }: { tenantId: string | null }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [rate, setRate] = useState("30");

  const connectionsQuery = useQuery({
    queryKey: ["channels", tenantId],
    queryFn: () => channelsApi.list(tenantId!),
    enabled: !!tenantId && open,
  });
  const segmentsQuery = useQuery({
    queryKey: ["contact-segments", tenantId],
    queryFn: () => contactTaxonomyApi.segments(tenantId!),
    enabled: !!tenantId && open,
  });
  const connections = (connectionsQuery.data ?? []).filter(
    (c) => c.provider === "whatsapp" || c.provider === "telegram",
  );
  const connection = connections.find((c) => c.id === connectionId);
  const templatesQuery = useQuery({
    queryKey: ["channel-templates", tenantId, connectionId],
    queryFn: () => channelsApi.templates(tenantId!, connectionId),
    enabled: !!tenantId && connection?.provider === "whatsapp",
  });
  const approved = (templatesQuery.data ?? []).filter((t) => t.status === "APPROVED");
  const template = approved.find((t) => t.id === templateId);
  const previewQuery = useQuery({
    queryKey: ["campaign-preview", tenantId, connectionId, segmentId],
    queryFn: () => campaignsApi.preview(tenantId!, connectionId, segmentId),
    enabled: !!tenantId && !!connectionId && !!segmentId,
  });

  const create = useMutation({
    mutationFn: () =>
      campaignsApi.create(tenantId!, {
        name: name.trim(),
        connectionId,
        segmentId,
        ratePerMinute: Number(rate) || 30,
        ...(connection?.provider === "whatsapp"
          ? { templateId, templateParams: params }
          : { text: text.trim() }),
      }),
    onSuccess: (campaign) => {
      setOpen(false);
      void navigate({ to: "/campanhas/$campaignId", params: { campaignId: campaign.id } });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível criar a campanha"),
  });

  const contentReady =
    connection?.provider === "whatsapp"
      ? !!template && params.every((p) => p.trim())
      : text.trim().length > 0;
  const ready = name.trim() && connection && segmentId && contentReady;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Nova campanha
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Só recebe quem aceitou campanhas e tem endereço no canal. No WhatsApp, a mensagem é um
            modelo aprovado pela Meta; no Telegram, texto livre para quem já falou com o bot.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Nome</Label>
            <Input
              id="campaign-name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select
                value={connectionId}
                onValueChange={(id) => {
                  setConnectionId(id);
                  setTemplateId("");
                  setParams([]);
                }}
              >
                <SelectTrigger aria-label="Canal">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {channelLabel[c.provider]} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select value={segmentId} onValueChange={setSegmentId}>
                <SelectTrigger aria-label="Segmento">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {segmentsQuery.data?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {previewQuery.data && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              <strong>{previewQuery.data.eligible}</strong> contato(s) vão receber.
              {previewQuery.data.withoutConsent > 0 &&
                ` ${previewQuery.data.withoutConsent} sem opt-in.`}
              {previewQuery.data.withoutAddress > 0 &&
                ` ${previewQuery.data.withoutAddress} sem endereço neste canal.`}
            </p>
          )}

          {connection?.provider === "whatsapp" && (
            <div className="space-y-1.5">
              <Label>Modelo aprovado</Label>
              <Select
                value={templateId}
                onValueChange={(id) => {
                  setTemplateId(id);
                  setParams(Array(approved.find((t) => t.id === id)?.variables ?? 0).fill(""));
                }}
              >
                <SelectTrigger aria-label="Modelo">
                  <SelectValue
                    placeholder={approved.length ? "Escolha" : "Sincronize os modelos em Canais"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {approved.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.language})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template && <p className="text-xs text-muted-foreground">{template.body}</p>}
              {params.map((value, i) => (
                <Input
                  key={i}
                  placeholder={`Variável {{${i + 1}}} — use {{nome}} para o nome do contato`}
                  value={value}
                  onChange={(e) => setParams(params.map((p, j) => (j === i ? e.target.value : p)))}
                />
              ))}
            </div>
          )}
          {connection?.provider === "telegram" && (
            <div className="space-y-1.5">
              <Label htmlFor="campaign-text">Mensagem</Label>
              <Textarea
                id="campaign-text"
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="campaign-rate">Envios por minuto</Label>
            <Input
              id="campaign-rate"
              type="number"
              min={1}
              max={600}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A organização inteira tem um teto de 120 envios por minuto, somando as campanhas.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!ready || create.isPending}>
              Criar rascunho
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
