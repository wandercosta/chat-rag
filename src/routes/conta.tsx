import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — ChatRAG" },
      { name: "description", content: "Verificação em duas etapas da sua conta." },
    ],
  }),
  component: AccountPage,
});

const post = <T,>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

/** Chave em blocos de 4, como os apps mostram ao digitar a mao. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

function AccountPage() {
  const { userEmail, refresh } = useSession();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const statusQuery = useQuery({
    queryKey: ["2fa-status"],
    queryFn: () =>
      apiFetch<{ enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number }>(
        "/auth/2fa",
      ),
  });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir");
  const done = async () => {
    setCode("");
    setSetup(null);
    await queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
    await refresh();
  };

  const start = useMutation({
    mutationFn: () => post<{ secret: string; otpauthUrl: string }>("/auth/2fa/setup"),
    onSuccess: setSetup,
    onError,
  });
  const enable = useMutation({
    mutationFn: () => post<{ recoveryCodes: string[] }>("/auth/2fa/enable", { code }),
    onSuccess: async (r) => {
      setRecoveryCodes(r.recoveryCodes);
      toast.success("Verificação em duas etapas ativada");
      await done();
    },
    onError,
  });
  const disable = useMutation({
    mutationFn: () => post("/auth/2fa/disable", { code }),
    onSuccess: async () => {
      toast.success("Verificação em duas etapas desativada");
      await done();
    },
    onError,
  });

  const status = statusQuery.data;

  return (
    <>
      <PageHeader title="Minha conta" description={userEmail ?? undefined} />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Verificação em duas etapas
            {status && (
              <Badge variant={status.enabled ? "secondary" : "outline"}>
                {status.enabled ? "ativa" : "desativada"}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Além da senha, o login pede um código de 6 dígitos do aplicativo autenticador (Google
            Authenticator, Microsoft Authenticator, 1Password…). Obrigatória para o Master quando a
            plataforma exige.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recoveryCodes && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
              <p className="font-medium">
                Guarde estes códigos de recuperação agora: cada um entra uma vez se você perder o
                celular, e eles não aparecem de novo.
              </p>
              <div className="grid grid-cols-2 gap-1 font-mono">
                {recoveryCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(recoveryCodes.join("\n"))
                    .then(() => toast.success("Copiados"))
                }
              >
                Copiar códigos
              </Button>
            </div>
          )}

          {status && !status.enabled && !setup && (
            <Button disabled={start.isPending} onClick={() => start.mutate()}>
              Ativar
            </Button>
          )}

          {setup && (
            <div className="space-y-3">
              <p className="text-sm">
                No aplicativo, escolha <strong>adicionar conta › inserir chave</strong> e digite:
              </p>
              <code className="block rounded bg-muted px-3 py-2 text-base tracking-wider">
                {grouped(setup.secret)}
              </code>
              <p className="text-xs text-muted-foreground">
                No celular, também dá para tocar em{" "}
                <a className="underline" href={setup.otpauthUrl}>
                  abrir no aplicativo
                </a>
                .
              </p>
            </div>
          )}

          {(setup || status?.enabled) && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (setup) enable.mutate();
                else disable.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="totp-code">
                  {setup ? "Código que o aplicativo mostra" : "Código para desativar"}
                </Label>
                <Input
                  id="totp-code"
                  className="w-56"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant={setup ? "default" : "outline"}
                disabled={code.trim().length < 6 || enable.isPending || disable.isPending}
              >
                {setup ? "Confirmar e ativar" : "Desativar"}
              </Button>
            </form>
          )}

          {status?.enabled && (
            <p className="text-xs text-muted-foreground">
              Ativa desde {new Date(status.enabledAt!).toLocaleDateString("pt-BR")} ·{" "}
              {status.recoveryCodesLeft} código(s) de recuperação restante(s).
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
