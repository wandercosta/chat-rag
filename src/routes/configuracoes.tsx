import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { allowedModels } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — ChatRAG" },
      { name: "description", content: "Estado das chaves de IA por ambiente, modelos permitidos, privacidade e WhatsApp." },
      { property: "og:title", content: "Configurações — ChatRAG" },
      { property: "og:description", content: "Configure a organização sem nunca exibir valores de chave." },
    ],
  }),
  component: SettingsPage,
});

// TODO(API): GET/PUT /api/tenants/{id}/settings — o valor da chave nunca retorna do servidor.
function SettingsPage() {
  const { can, aiKeyReady, setAiKeyReady } = useSession();
  const [reuse, setReuse] = useState(true);

  if (!can("settings")) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Seu perfil não acessa configurações.</Card>;
  }

  const state = aiKeyReady ? "válida" : "não configurada";

  return (
    <>
      <PageHeader title="Configurações" description="Ajustes da organização ativa." />
      <ActivationBanner />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chave de IA (OpenAI)</CardTitle>
          <CardDescription>
            O valor salvo nunca é exibido novamente — apenas o estado da conexão. Cole um novo valor para substituir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Reutilizar a mesma chave nos dois ambientes</p>
              <p className="text-xs text-muted-foreground">Teste e produção compartilham a credencial.</p>
            </div>
            <Switch checked={reuse} onCheckedChange={setReuse} />
          </div>
          <Separator />
          {(reuse ? ["compartilhada"] : ["teste", "produção"]).map((env) => (
            <div key={env} className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor={`k-${env}`} className="capitalize">
                  Chave {env}
                </Label>
                <StatusBadge status={state} />
              </div>
              <div className="flex gap-2">
                <Input id={`k-${env}`} type="password" placeholder="Cole a nova chave" />
                <Button
                  onClick={() => {
                    setAiKeyReady(true);
                    toast.success("Chave validada e substituída (simulado)");
                  }}
                >
                  Salvar
                </Button>
              </div>
            </div>
          ))}
          {aiKeyReady && (
            <Button variant="outline" size="sm" onClick={() => setAiKeyReady(false)}>
              Simular chave ausente
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Modelos permitidos</CardTitle>
            <CardDescription>Somente leitura — definido pelo Master da plataforma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {allowedModels.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-mono text-xs">{m.label}</span>
                <Badge variant="outline">{m.note}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Privacidade e retenção</CardTitle>
            <CardDescription>Padrões aplicados a todos os assistentes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="s-ret">Retenção de conversas</Label>
              <Select defaultValue="90">
                <SelectTrigger id="s-ret">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Não reter</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                  <SelectItem value="365">12 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Anonimizar visitantes</p>
                <p className="text-xs text-muted-foreground">Remove identificadores das transcrições.</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="grid gap-2">
              <Label htmlFor="s-wpp">WhatsApp de encaminhamento</Label>
              <Input id="s-wpp" defaultValue="+55 11 4000-0000" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">Encaminhamento habilitado</p>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
