import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ActivationBanner } from "@/components/activation-banner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assistants, allowedModels, knowledgeTopics } from "@/lib/mock-data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/assistentes/$assistantId")({
  loader: ({ params }) => {
    // TODO(API): GET /api/tenants/{id}/assistants/{assistantId}
    const assistant = assistants.find((a) => a.id === params.assistantId);
    if (!assistant) throw notFound();
    return { assistant };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.assistant.name} — ChatRAG` : "Assistente — ChatRAG" },
      { name: "description", content: "Configuração de identidade, conhecimento, privacidade e widget do assistente." },
      { property: "og:title", content: "Configuração do assistente — ChatRAG" },
      { property: "og:description", content: "Identidade, coleções, privacidade e aparência do widget." },
    ],
  }),
  component: AssistantDetail,
});

function AssistantDetail() {
  const { assistant } = Route.useLoaderData();
  const { can } = useSession();
  const readOnly = !can("write");
  const [collections, setCollections] = useState<string[]>(assistant.collections);
  const [widgetColor, setWidgetColor] = useState("#1f8a9c");
  const [mode, setMode] = useState("floating");

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/assistentes">
          <ArrowLeft /> Assistentes
        </Link>
      </Button>
      <PageHeader
        title={assistant.name}
        description={`Modelo ${assistant.model} · atualizado em ${assistant.updatedAt}`}
        actions={
          <>
            <StatusBadge status={assistant.status} className="h-9 px-3 text-sm" />
            <Button asChild variant="outline">
              <Link to="/playground" search={{ assistente: assistant.id }}>
                Testar no playground
              </Link>
            </Button>
            <Button disabled={readOnly} onClick={() => toast.success("Configuração salva (simulado)")}>
              <Save /> Salvar
            </Button>
          </>
        }
      />
      <ActivationBanner context="respostas do assistente" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identidade</CardTitle>
            <CardDescription>Como o assistente se apresenta ao visitante.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-14">
                <AvatarFallback className="bg-primary/12 text-primary">
                  {assistant.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Button variant="outline" size="sm" disabled={readOnly}>
                Enviar avatar
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-name">Nome</Label>
              <Input id="a-name" defaultValue={assistant.name} disabled={readOnly} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-model">Modelo</Label>
              <Select defaultValue={assistant.model} disabled={readOnly}>
                <SelectTrigger id="a-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} · {m.note}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-instr">Instruções (opcional)</Label>
              <Textarea
                id="a-instr"
                rows={5}
                disabled={readOnly}
                placeholder="Tom de voz, escopo de atendimento, o que evitar…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conhecimento e modo de resposta</CardTitle>
            <CardDescription>Coleções consultadas para fundamentar as respostas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              {knowledgeTopics.map((t) => (
                <label key={t.id} className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={collections.includes(t.name)}
                    disabled={readOnly}
                    onCheckedChange={(v) =>
                      setCollections((c) => (v ? [...c, t.name] : c.filter((x) => x !== t.name)))
                    }
                  />
                  <span className="text-sm">
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <Separator />
            <div className="flex items-start justify-between gap-4 rounded-md border border-dashed p-3">
              <div>
                <p className="text-sm font-medium">Permitir conhecimento geral</p>
                <p className="text-xs text-muted-foreground">
                  Hoje o assistente responde em modo estrito (apenas a base).
                </p>
                <Badge variant="outline" className="mt-2">
                  Disponível em fase futura
                </Badge>
              </div>
              <Switch disabled aria-label="Permitir conhecimento geral" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Privacidade e retenção</CardTitle>
            <CardDescription>Dados do visitante e histórico de conversas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="a-priv">Privacidade do visitante</Label>
              <Select defaultValue="anonimo" disabled={readOnly}>
                <SelectTrigger id="a-priv">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anonimo">Anônimo (sem identificação)</SelectItem>
                  <SelectItem value="pseudonimo">Pseudônimo por sessão</SelectItem>
                  <SelectItem value="identificado">Identificado pelo site hospedeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-ret">Retenção de histórico</Label>
              <Select defaultValue="90" disabled={readOnly}>
                <SelectTrigger id="a-ret">
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
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Encaminhamento para WhatsApp</p>
                <p className="text-xs text-muted-foreground">Oferece atendimento humano quando não há resposta.</p>
              </div>
              <Switch defaultChecked disabled={readOnly} aria-label="Encaminhamento WhatsApp" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-wpp">Número de destino</Label>
              <Input id="a-wpp" defaultValue="+55 11 4000-0000" disabled={readOnly} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-wpp-msg">Mensagem inicial</Label>
              <Input
                id="a-wpp-msg"
                defaultValue="Olá! Vim do atendimento digital e preciso de ajuda."
                disabled={readOnly}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aparência do widget</CardTitle>
            <CardDescription>Como o assistente aparece no site externo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="w-color">Cor de destaque</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="w-color"
                    type="color"
                    className="h-9 w-14 p-1"
                    value={widgetColor}
                    disabled={readOnly}
                    onChange={(e) => setWidgetColor(e.target.value)}
                  />
                  <Input value={widgetColor} readOnly className="font-mono" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="w-theme">Tema</Label>
                <Select defaultValue="sincronizado" disabled={readOnly}>
                  <SelectTrigger id="w-theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claro">Claro</SelectItem>
                    <SelectItem value="escuro">Escuro</SelectItem>
                    <SelectItem value="sincronizado">Sincronizado com o site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="w-pos">Posição</Label>
                <Select defaultValue="direita" disabled={readOnly}>
                  <SelectTrigger id="w-pos">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direita">Inferior direita</SelectItem>
                    <SelectItem value="esquerda">Inferior esquerda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="w-mode">Modo</Label>
                <Select value={mode} onValueChange={setMode} disabled={readOnly}>
                  <SelectTrigger id="w-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="floating">Flutuante</SelectItem>
                    <SelectItem value="inline">Embutido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="w-logo">Logo</Label>
              <Input id="w-logo" type="file" disabled={readOnly} />
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">Pré-visualização</p>
              <div className="flex justify-end">
                <div className="w-56 overflow-hidden rounded-lg border bg-card shadow-panel">
                  <div className="px-3 py-2 text-xs font-medium" style={{ background: widgetColor, color: "#fff" }}>
                    {assistant.name}
                  </div>
                  <div className="space-y-2 p-3 text-xs">
                    <p className="w-fit rounded-md bg-muted px-2 py-1">Como posso ajudar?</p>
                    <p className="ml-auto w-fit rounded-md px-2 py-1 text-white" style={{ background: widgetColor }}>
                      Qual a tarifa?
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
