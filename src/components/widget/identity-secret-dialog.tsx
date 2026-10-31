import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ApiError, widgetKeysApi, type WidgetKey } from "@/lib/api-client";

const EXAMPLE = `// No servidor do seu site (Node.js), nunca no navegador:
import crypto from "node:crypto";

const b64 = (v) => Buffer.from(v).toString("base64url");
function tokenDoVisitante(usuario, segredo) {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(JSON.stringify({
    sub: usuario.id,            // obrigatorio
    name: usuario.nome,
    email: usuario.email,
    exp: Math.floor(Date.now() / 1000) + 3600, // ate 24 horas
  }));
  const assinatura = crypto.createHmac("sha256", segredo)
    .update(header + "." + payload).digest("base64url");
  return header + "." + payload + "." + assinatura;
}
// <script ... data-identity-token="TOKEN_GERADO_AQUI"></script>`;

/**
 * Identidade assinada do visitante para uma chave do widget: segredo
 * (mostrado uma vez so) e a opcao de exigir assinatura.
 */
export function IdentitySecretDialog({
  tenantId,
  widgetKey: k,
  disabled,
}: {
  tenantId: string;
  widgetKey: WidgetKey;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["widget-keys", tenantId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir");

  const rotate = useMutation({
    mutationFn: () => widgetKeysApi.rotateIdentitySecret(tenantId, k.id),
    onSuccess: (r) => {
      setSecret(r.secret);
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => widgetKeysApi.removeIdentitySecret(tenantId, k.id),
    onSuccess: refresh,
    onError,
  });
  const require = useMutation({
    mutationFn: (on: boolean) => widgetKeysApi.setRequireSignedIdentity(tenantId, k.id, on),
    onSuccess: refresh,
    onError,
  });

  return (
    <Dialog onOpenChange={(open) => !open && setSecret(null)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={disabled}>
          <KeyRound /> Identidade
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Identidade assinada do visitante</DialogTitle>
          <DialogDescription>
            O servidor do seu site assina quem é o cliente com este segredo e passa o token em{" "}
            <code>data-identity-token</code>. Só com o token o widget retoma a conversa anterior com
            o histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {secret ? (
            <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-xs font-medium">
                Copie agora: o segredo não aparece de novo. Guarde só no servidor do seu site.
              </p>
              <div className="flex gap-2">
                <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">
                  {secret}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Copiar segredo"
                  onClick={() => void navigator.clipboard.writeText(secret)}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {k.identity_secret_hint
                ? `Segredo cadastrado (termina em ${k.identity_secret_hint}).`
                : "Nenhum segredo cadastrado."}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
              {k.identity_secret_hint ? "Trocar segredo" : "Gerar segredo"}
            </Button>
            {k.identity_secret_hint && (
              <Button
                size="sm"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("Remover o segredo? Tokens assinados com ele param de valer."))
                    remove.mutate();
                }}
              >
                Remover segredo
              </Button>
            )}
          </div>

          <label className="flex items-start gap-3">
            <Switch
              checked={k.require_signed_identity}
              disabled={!k.identity_secret_hint || require.isPending}
              onCheckedChange={(on) => require.mutate(on)}
              aria-label="Exigir identidade assinada"
            />
            <span className="space-y-0.5">
              <span className="block font-medium">Exigir identidade assinada</span>
              <span className="block text-xs text-muted-foreground">
                Ligado, nome, e-mail, id e contexto vindos de <code>data-*</code> sem token são
                ignorados: o visitante conversa como anônimo.
              </span>
            </span>
          </label>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-xs font-medium">
              Como gerar o token (exemplo)
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre text-[11px]">{EXAMPLE}</pre>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
}
