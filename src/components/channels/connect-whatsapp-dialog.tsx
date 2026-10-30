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
import { channelsApi, type NewWhatsAppConnection } from "@/lib/channels-api";

const empty: NewWhatsAppConnection = {
  name: "",
  assistantId: "",
  phoneNumberId: "",
  wabaId: "",
  accessToken: "",
  appSecret: "",
};

const fields: {
  key: keyof NewWhatsAppConnection;
  label: string;
  hint: string;
  secret?: boolean;
}[] = [
  { key: "name", label: "Nome", hint: "Como o canal aparece no painel, ex.: WhatsApp vendas" },
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
  {
    key: "accessToken",
    label: "Token de acesso permanente",
    hint: "Token de um usuário do sistema com permissão whatsapp_business_messaging",
    secret: true,
  },
  {
    key: "appSecret",
    label: "Chave secreta do app",
    hint: "Configurações do app › Básico; confere a assinatura de cada webhook",
    secret: true,
  },
];

/** Conecta um numero do WhatsApp Business do proprio tenant (ADR-006 #7). */
export function ConnectWhatsAppDialog({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(empty);

  const assistantsQuery = useQuery({
    queryKey: ["assistants", tenantId],
    queryFn: () => assistantsApi.list(tenantId!),
    enabled: !!tenantId && open,
  });

  const create = useMutation({
    mutationFn: () => channelsApi.createWhatsApp(tenantId!, values),
    onSuccess: () => {
      toast.success("WhatsApp conectado. Agora cadastre o webhook na Meta.");
      setOpen(false);
      setValues(empty);
      void queryClient.invalidateQueries({ queryKey: ["channels", tenantId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível conectar"),
  });

  const ready = Object.values(values).every((v) => v.trim() !== "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Conectar WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
          <DialogDescription>
            Use um número da sua própria conta do WhatsApp Business na API oficial da Meta. As
            conversas são cobradas pela Meta na sua conta. O token e a chave secreta ficam cifrados
            e não aparecem de novo.
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
              value={values.assistantId}
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
              <Label htmlFor={`wa-${field.key}`}>{field.label}</Label>
              <Input
                id={`wa-${field.key}`}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                value={values[field.key]}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{field.hint}</p>
            </div>
          ))}
          <DialogFooter>
            <Button type="submit" disabled={!ready || create.isPending}>
              {create.isPending ? "Conferindo com a Meta…" : "Conectar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
