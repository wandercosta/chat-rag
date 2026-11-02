import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ApiError, assistantsApi } from "@/lib/api-client";
import { channelLabel, channelsApi, type ChannelProvider } from "@/lib/channels-api";

interface Field {
  key: string;
  label: string;
  hint: string;
  secret?: boolean;
}

const nameField: Field = { key: "name", label: "Nome", hint: "Como o canal aparece no painel" };
const metaSecrets: Field[] = [
  {
    key: "accessToken",
    label: "Token de acesso",
    hint: "Token permanente de um usuário do sistema (Gerenciador de Negócios)",
    secret: true,
  },
  {
    key: "appSecret",
    label: "Chave secreta do app",
    hint: "Configurações do app › Básico; confere a assinatura de cada webhook",
    secret: true,
  },
];

/** Campos de cada provedor; o guia completo esta em docs/integrations. */
const providerFields: Record<ChannelProvider, { intro: string; fields: Field[] }> = {
  whatsapp: {
    intro:
      "Número da sua própria conta do WhatsApp Business na API oficial da Meta; as conversas são cobradas pela Meta na sua conta.",
    fields: [
      nameField,
      {
        key: "phoneNumberId",
        label: "ID do número de telefone",
        hint: "Meta for Developers › WhatsApp › Configuração da API",
      },
      {
        key: "wabaId",
        label: "ID da conta do WhatsApp Business",
        hint: "Mesma tela, logo abaixo do número",
      },
      ...metaSecrets,
    ],
  },
  messenger: {
    intro: "Mensagens da sua Página do Facebook pela plataforma oficial de mensagens da Meta.",
    fields: [
      nameField,
      { key: "pageId", label: "ID da Página", hint: "Página › Sobre › Transparência da Página" },
      ...metaSecrets,
    ],
  },
  instagram: {
    intro:
      "Direct de uma conta profissional do Instagram ligada a uma Página; as respostas saem pela Página.",
    fields: [
      nameField,
      {
        key: "instagramAccountId",
        label: "ID da conta profissional do Instagram",
        hint: "Meta for Developers › Instagram › Configuração da API",
      },
      {
        key: "pageId",
        label: "ID da Página ligada",
        hint: "Página conectada à conta do Instagram",
      },
      ...metaSecrets,
    ],
  },
  telegram: {
    intro:
      "Bot criado no @BotFather. O webhook é registrado sozinho no Telegram; precisa de um endereço público com HTTPS.",
    fields: [
      nameField,
      {
        key: "botToken",
        label: "Token do bot",
        hint: "O @BotFather mostra ao criar o bot (/newbot)",
        secret: true,
      },
    ],
  },
};

/** Conecta uma conta do proprio tenant (ADR-006 #7). Os segredos ficam cifrados. */
export function ConnectChannelDialog({
  tenantId,
  provider,
}: {
  tenantId: string | null;
  provider: ChannelProvider;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const { intro, fields } = providerFields[provider];

  const assistantsQuery = useQuery({
    queryKey: ["assistants", tenantId],
    queryFn: () => assistantsApi.list(tenantId!),
    enabled: !!tenantId && open,
  });

  const create = useMutation({
    mutationFn: () => channelsApi.connect(tenantId!, provider, values),
    onSuccess: (connection) => {
      if (connection.status === "erro")
        toast.error(connection.status_detail ?? "Conectado com erro");
      else toast.success(`${channelLabel[provider]} conectado`);
      setOpen(false);
      setValues({});
      void queryClient.invalidateQueries({ queryKey: ["channels", tenantId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível conectar"),
  });

  const ready = !!values.assistantId && fields.every((f) => (values[f.key] ?? "").trim() !== "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={provider === "whatsapp" ? "default" : "outline"}>
          <Plus />
          {channelLabel[provider]}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar {channelLabel[provider]}</DialogTitle>
          <DialogDescription>
            {intro} Token e chave ficam cifrados e não aparecem de novo.
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
            <Label>Assistente que responde</Label>
            <Select
              value={values.assistantId ?? ""}
              onValueChange={(assistantId) => setValues({ ...values, assistantId })}
            >
              <SelectTrigger aria-label="Assistente que responde">
                <SelectValue placeholder="Escolha o assistente" />
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
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label htmlFor={`${provider}-${field.key}`}>{field.label}</Label>
              <Input
                id={`${provider}-${field.key}`}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                value={values[field.key] ?? ""}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{field.hint}</p>
            </div>
          ))}
          <DialogFooter>
            <Button type="submit" disabled={!ready || create.isPending}>
              {create.isPending ? "Conferindo…" : "Conectar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
