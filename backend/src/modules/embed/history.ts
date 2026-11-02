import type { MessageCitation, MessageRole } from "../../db/types.js";
import { attachmentsService } from "../conversations/index.js";

/**
 * Historico devolvido ao widget ao retomar a conversa. Arquivo enviado pelo
 * atendente vai como link publico temporario; arquivo recebido do cliente
 * nunca sai daqui.
 */
export async function withAttachments(
  messages: { id: string; role: MessageRole; content: string; citations: MessageCitation[] }[],
) {
  const agentIds = messages.filter((m) => m.role === "atendente").map((m) => m.id);
  const attachments = (await attachmentsService.listForMessages(agentIds)).filter(
    (a) => a.status === "pronto",
  );
  return messages.map((m) => {
    const files = attachments.filter((a) => a.message_id === m.id);
    return {
      role: m.role,
      content: m.content,
      citations: m.citations,
      ...(files.length > 0 && {
        attachments: files.map((a) => ({
          kind: a.kind,
          fileName: a.file_name ?? "arquivo",
          path: attachmentsService.linkPath(a.id),
        })),
      }),
    };
  });
}
