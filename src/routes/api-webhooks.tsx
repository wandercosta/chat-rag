import { createFileRoute } from "@tanstack/react-router";
import { ApiTokensCard } from "@/components/developers/api-tokens-card";
import { WebhooksCard } from "@/components/developers/webhooks-card";
import { PageHeader } from "@/components/page-header";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/api-webhooks")({
  head: () => ({
    meta: [
      { title: "API e webhooks — ChatRAG" },
      {
        name: "description",
        content: "Tokens da API REST e webhooks para integrar o ChatRAG aos seus sistemas.",
      },
    ],
  }),
  component: DevelopersPage,
});

function DevelopersPage() {
  const { tenantId } = useSession();
  return (
    <>
      <PageHeader
        title="API e webhooks"
        description="Integre contatos e conversas com os sistemas da sua empresa."
      />
      {tenantId && (
        <div className="grid gap-4">
          <ApiTokensCard tenantId={tenantId} />
          <WebhooksCard tenantId={tenantId} />
        </div>
      )}
    </>
  );
}
