import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
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
import { assistantsApi } from "@/lib/api-client";
import { channelsApi } from "@/lib/channels-api";

interface FacebookSdk {
  init(options: Record<string, unknown>): void;
  login(
    callback: (response: { authResponse?: { code?: string } | null }) => void,
    options: Record<string, unknown>,
  ): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

/** SDK oficial do Facebook, carregado so quando alguem usa o cadastro integrado. */
function loadFacebookSdk(appId: string): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("nao foi possivel carregar o SDK da Meta"));
    document.body.append(script);
  });
}

/**
 * Numero e conta escolhidos na janela da Meta chegam por postMessage
 * (WA_EMBEDDED_SIGNUP); o code chega no retorno do FB.login.
 */
function runEmbeddedSignup(appId: string, configId: string) {
  return new Promise<{ code: string; phoneNumberId: string; wabaId: string }>((resolve, reject) => {
    let ids: { phoneNumberId: string; wabaId: string } | null = null;
    let code: string | null = null;
    const finish = () => {
      if (!ids || !code) return;
      window.removeEventListener("message", onMessage);
      resolve({ code, ...ids });
    };
    const onMessage = (event: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" && data.data?.phone_number_id && data.data?.waba_id) {
          ids = { phoneNumberId: data.data.phone_number_id, wabaId: data.data.waba_id };
          finish();
        } else if (data.event === "CANCEL" || data.event === "ERROR") {
          window.removeEventListener("message", onMessage);
          reject(new Error("cadastro cancelado na Meta"));
        }
      } catch {
        // mensagem de outra origem ou formato: ignora.
      }
    };
    window.addEventListener("message", onMessage);
    loadFacebookSdk(appId)
      .then((fb) =>
        fb.login(
          (response) => {
            if (!response.authResponse?.code) {
              window.removeEventListener("message", onMessage);
              reject(new Error("a Meta nao autorizou o cadastro"));
              return;
            }
            code = response.authResponse.code;
            finish();
          },
          {
            config_id: configId,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, sessionInfoVersion: "3" },
          },
        ),
      )
      .catch(reject);
  });
}

/**
 * Conectar WhatsApp sem copiar ids e token: so aparece se a plataforma tiver
 * o app da Meta configurado (docs/integrations/whatsapp.md).
 */
export function EmbeddedSignupDialog({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("WhatsApp");
  const [assistantId, setAssistantId] = useState("");

  const configQuery = useQuery({
    queryKey: ["embedded-signup", tenantId],
    queryFn: () => channelsApi.embeddedSignupConfig(tenantId!),
    enabled: !!tenantId,
  });
  const assistantsQuery = useQuery({
    queryKey: ["assistants", tenantId],
    queryFn: () => assistantsApi.list(tenantId!),
    enabled: !!tenantId && open,
  });

  const connect = useMutation({
    mutationFn: async () => {
      const config = configQuery.data!.config!;
      const result = await runEmbeddedSignup(config.appId, config.configId);
      return channelsApi.connectEmbedded(tenantId!, { name, assistantId, ...result });
    },
    onSuccess: (connection) => {
      void queryClient.invalidateQueries({ queryKey: ["channels", tenantId] });
      if (connection.status === "ativo") toast.success("WhatsApp conectado");
      else toast.error(connection.status_detail ?? "Conectado, mas com erro");
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível conectar"),
  });

  if (!configQuery.data?.config) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Zap /> WhatsApp com a Meta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp pela Meta</DialogTitle>
          <DialogDescription>
            Abre uma janela da Meta para você entrar, escolher (ou criar) a conta do WhatsApp
            Business e o número. Sem copiar ids nem token.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="es-name">Nome do canal</Label>
            <Input
              id="es-name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Assistente que responde</Label>
            <Select value={assistantId} onValueChange={setAssistantId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha…" />
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
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim() || !assistantId || connect.isPending}
            onClick={() => connect.mutate()}
          >
            {connect.isPending ? "Aguardando a Meta…" : "Continuar na Meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
