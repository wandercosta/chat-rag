import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { API_SCOPES, developersApi, type ApiScope } from "@/lib/developers-api";
import { SecretReveal } from "./secret-reveal";

const scopeLabel = (id: string) => API_SCOPES.find((s) => s.id === id)?.label ?? id;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "nunca");

export function ApiTokensCard({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["contacts:read"]);
  const [created, setCreated] = useState<string | null>(null);

  const tokensQuery = useQuery({
    queryKey: ["api-tokens", tenantId],
    queryFn: () => developersApi.tokens(tenantId),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["api-tokens", tenantId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir");

  const create = useMutation({
    mutationFn: () => developersApi.createToken(tenantId, name.trim(), scopes),
    onSuccess: (token) => {
      setCreated(token.token);
      setName("");
      refresh();
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => developersApi.revokeToken(tenantId, id),
    onSuccess: () => {
      toast.success("Token revogado");
      refresh();
    },
    onError,
  });

  const toggleScope = (id: ApiScope, on: boolean) =>
    setScopes((current) => (on ? [...current, id] : current.filter((s) => s !== id)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tokens da API</CardTitle>
        <CardDescription>
          Para sistemas da sua empresa (ERP, site, planilhas) lerem e criarem contatos e lerem
          conversas pela API REST. Envie no cabeçalho <code>Authorization: Bearer …</code>. Limite
          de 120 chamadas por minuto por token. Quem cria o token responde pelo que ele faz.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {created && (
          <SecretReveal label="Copie o token agora: ele não aparece de novo." value={created} />
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="token-name">Nome</Label>
              <Input
                id="token-name"
                className="w-64"
                placeholder="Ex.: ERP da loja"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={name.trim().length < 2 || scopes.length === 0 || create.isPending}
            >
              Criar token
            </Button>
          </div>
          <div className="flex flex-wrap gap-4">
            {API_SCOPES.map((scope) => (
              <label key={scope.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes.includes(scope.id)}
                  onCheckedChange={(v) => toggleScope(scope.id, v === true)}
                />
                {scope.label}
              </label>
            ))}
          </div>
        </form>

        <div className="divide-y rounded-md border">
          {tokensQuery.data?.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Nenhum token criado.</p>
          )}
          {tokensQuery.data?.map((token) => (
            <div key={token.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="min-w-48 flex-1">
                <p className="font-medium">
                  {token.name}{" "}
                  <code className="text-xs text-muted-foreground">{token.token_prefix}…</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  {token.scopes.map(scopeLabel).join(" · ")} · usado por último:{" "}
                  {date(token.last_used_at)}
                </p>
              </div>
              {token.revoked_at ? (
                <Badge variant="outline">revogado</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (confirm(`Revogar o token "${token.name}"? Quem o usa perde o acesso.`)) {
                      revoke.mutate(token.id);
                    }
                  }}
                >
                  Revogar
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
