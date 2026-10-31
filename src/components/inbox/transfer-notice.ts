import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { InboxSector, TransferEvent } from "@/lib/inbox-api";
import { useSession } from "@/lib/session";

/**
 * Aviso de transferencia no painel de quem recebe: a pessoa escolhida, ou
 * quem esta no setor quando a conversa vai para a fila dele. Quem transferiu
 * nao recebe aviso. O callback e estavel para nao reabrir o tempo real.
 */
export function useTransferNotice(
  sectors: InboxSector[],
  openConversation: (conversationId: string) => void,
) {
  const { userId } = useSession();
  const sectorsRef = useRef(sectors);
  useEffect(() => {
    sectorsRef.current = sectors;
  }, [sectors]);

  return useCallback(
    (event: TransferEvent) => {
      if (!userId || event.byUserId === userId) return;
      const sector = sectorsRef.current.find((s) => s.id === event.toSectorId);
      const forMe = event.toUserId === userId;
      const forMySector = !event.toUserId && !!sector?.memberIds.includes(userId);
      if (!forMe && !forMySector) return;
      toast(
        forMe
          ? "Uma conversa foi transferida para você"
          : `Nova conversa na fila do setor ${sector!.name}`,
        { action: { label: "Abrir", onClick: () => openConversation(event.conversationId) } },
      );
    },
    [userId, openConversation],
  );
}
