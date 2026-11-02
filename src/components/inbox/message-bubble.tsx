import { CitationList } from "@/components/citation-list";
import { MessageAttachments } from "@/components/conversations/message-attachments";
import { deliveryLabel } from "@/lib/channels-api";
import type { InboxConversationDetail } from "@/lib/inbox-api";

/** Uma mensagem da conversa: quem escreveu, fontes, anexos e recibo do canal. */
export function MessageBubble({
  message: m,
  organizationId,
  conversationId,
}: {
  message: InboxConversationDetail["messages"][number];
  organizationId: string;
  conversationId: string;
}) {
  const ours = m.role !== "visitante";
  const label =
    m.role === "visitante"
      ? "Visitante"
      : m.role === "assistente"
        ? "Assistente"
        : (m.author_email ?? "Atendente");
  return (
    <div className={ours ? "flex flex-col items-end" : "flex flex-col items-start"}>
      <span className="mb-0.5 text-xs text-muted-foreground">{label}</span>
      <div
        className={
          m.role === "atendente"
            ? "w-fit max-w-[80%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
            : m.role === "assistente"
              ? "w-fit max-w-[80%] whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm"
              : "w-fit max-w-[80%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm"
        }
      >
        {m.content}
        {m.citations?.length ? <CitationList citations={m.citations} /> : null}
        <MessageAttachments
          organizationId={organizationId}
          conversationId={conversationId}
          attachments={m.attachments}
        />
      </div>
      {m.delivery_status && (
        <span
          className={`mt-0.5 text-[11px] ${m.delivery_status === "falhou" ? "text-destructive" : "text-muted-foreground"}`}
          title={m.delivery_error ?? undefined}
        >
          {deliveryLabel[m.delivery_status]}
          {m.delivery_error ? `: ${m.delivery_error}` : ""}
        </span>
      )}
    </div>
  );
}
