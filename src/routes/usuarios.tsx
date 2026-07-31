import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários e permissões — ChatRAG" },
      { name: "description", content: "Usuários da organização, perfis de acesso e convites administrativos." },
      { property: "og:title", content: "Usuários e permissões — ChatRAG" },
      { property: "og:description", content: "Convites por e-mail ou senha provisória; não há cadastro público." },
    ],
  }),
  component: UsersPage,
});

/**
 * Esta tela nao tem backend: nao existem rotas de listagem de usuarios do
 * tenant nem de convite (o modulo identity so expoe login/logout/me). A versao
 * anterior mostrava quatro usuarios ficticios e um "convite enviado
 * (simulado)", o que dava a entender que a gestao de acesso ja funcionava.
 * Melhor mostrar o estado real ate as rotas existirem.
 */
function UsersPage() {
  const { can, userEmail, profile } = useSession();

  if (!can("users")) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Seu perfil não acessa usuários.</Card>;
  }

  return (
    <>
      <PageHeader
        title="Usuários e permissões"
        description="Todo acesso é criado por um administrador — o produto não possui cadastro público."
      />
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Construction className="size-4 text-warning" />
            <CardTitle className="text-base">Ainda não disponível</CardTitle>
          </div>
          <CardDescription>
            A gestão de usuários do tenant ainda não existe no backend — não há rotas de listagem nem de convite.
            Enquanto isso, novos usuários só são criados junto com a organização (o administrador inicial, definido
            pelo Master na criação do tenant).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">{userEmail ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              Você, nesta organização · perfil {profile ?? "—"}
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
