import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { channelLabel } from "@/lib/channels-api";

interface TenantChannel {
  id: string;
  provider: string;
  name: string;
  external_id: string;
  config: Record<string, string>;
  status: "ativo" | "erro" | "inativo";
  status_detail: string | null;
  updated_at: string;
}

/** Como a conta aparece: numero, Pagina ou @bot (o config guarda o que a API conferiu). */
function accountOf(c: TenantChannel) {
  return (
    c.config.displayPhone ||
    c.config.pageName ||
    (c.config.username ? `@${c.config.username}` : "") ||
    c.external_id
  );
}

/**
 * Canais do tenant na visao do Master: so estado e identificacao, para o
 * suporte saber se um canal caiu. Como o estado da chave de IA, so com sessao
 * de suporte ativa. Nada de token ou conteudo de conversa.
 */
export function TenantChannelsCard({
  tenantId,
  hasActiveSupport,
}: {
  tenantId: string;
  hasActiveSupport: boolean;
}) {
  const query = useQuery({
    queryKey: ["master-tenant-channels", tenantId],
    queryFn: () => apiFetch<TenantChannel[]>(`/master/tenants/${tenantId}/channels`),
    enabled: hasActiveSupport,
  });
  const channels = query.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Canais</CardTitle>
        <CardDescription>Estado dos canais conectados pelo tenant. Sem tokens.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!hasActiveSupport && (
          <p className="text-muted-foreground">
            Abra uma sessão de suporte para ver o estado dos canais.
          </p>
        )}
        {hasActiveSupport && query.isSuccess && channels.length === 0 && (
          <p className="text-muted-foreground">Nenhum canal conectado.</p>
        )}
        {channels.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{channelLabel[c.provider] ?? c.provider}</Badge>
            <span className="font-medium">{c.name}</span>
            <span className="text-muted-foreground">{accountOf(c)}</span>
            {c.config.signup === "embedded" && (
              <Badge variant="secondary">cadastro integrado</Badge>
            )}
            <Badge variant={c.status === "ativo" ? "secondary" : "destructive"}>{c.status}</Badge>
            {c.status_detail && (
              <span className="w-full text-xs text-destructive">{c.status_detail}</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
