import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { InboxPanelEvent, InboxSector } from "@/lib/inbox-api";
import { useSession } from "@/lib/session";

const PREFS_KEY = "chatrag:inbox-alerts";

export interface AlertPrefs {
  sound: boolean;
  desktop: boolean;
}

/** Preferencia de cada navegador (som e aviso do sistema); o servidor nao guarda. */
export function useAlertPrefs() {
  const [prefs, setPrefs] = useState<AlertPrefs>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
      return { sound: saved?.sound ?? true, desktop: saved?.desktop ?? false };
    } catch {
      return { sound: true, desktop: false };
    }
  });
  const update = useCallback((next: AlertPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // modo privado: vale so nesta aba.
    }
  }, []);
  return [prefs, update] as const;
}

/** Bipe curto gerado na hora (sem arquivo de audio). */
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => void ctx.close();
  } catch {
    // navegador sem audio ou bloqueado ate a primeira interacao.
  }
}

/**
 * Avisos da caixa de entrada para quem atende: conversa nova na fila (sem
 * setor ou de um setor da pessoa), mensagem do cliente numa conversa dela e
 * transferencia para ela ou para o setor dela. Toast sempre; som e aviso do
 * sistema conforme a preferencia (o do sistema so com a aba em segundo plano).
 * O callback e estavel para nao reabrir o tempo real.
 */
export function useInboxAlerts(
  sectors: InboxSector[],
  prefs: AlertPrefs,
  openConversation: (conversationId: string) => void,
) {
  const { userId, profile } = useSession();
  const state = useRef({ sectors, prefs });
  useEffect(() => {
    state.current = { sectors, prefs };
  }, [sectors, prefs]);

  return useCallback(
    (event: InboxPanelEvent) => {
      if (!userId || (profile !== "Administrador" && profile !== "Atendente")) return;
      const { sectors: list, prefs: current } = state.current;
      const mySector = (id: string | null) =>
        !!id && !!list.find((s) => s.id === id)?.memberIds.includes(userId);
      const sectorName = (id: string | null) => list.find((s) => s.id === id)?.name;

      let message: string | null = null;
      if (event.kind === "queued" && (!event.sectorId || mySector(event.sectorId))) {
        message = event.sectorId
          ? `Nova conversa na fila do setor ${sectorName(event.sectorId)}`
          : "Nova conversa na fila";
      } else if (event.kind === "visitor_message" && event.assignedUserId === userId) {
        message = "O cliente respondeu numa conversa sua";
      } else if (event.kind === "transfer" && event.byUserId !== userId) {
        if (event.toUserId === userId) message = "Uma conversa foi transferida para você";
        else if (!event.toUserId && mySector(event.toSectorId))
          message = `Nova conversa na fila do setor ${sectorName(event.toSectorId)}`;
      }
      if (!message) return;

      const open = () => openConversation(event.conversationId);
      toast(message, { action: { label: "Abrir", onClick: open } });
      if (current.sound) beep();
      if (
        current.desktop &&
        document.hidden &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const n = new Notification("ChatRAG", { body: message, tag: event.conversationId });
        n.onclick = () => {
          window.focus();
          open();
        };
      }
    },
    [userId, profile, openConversation],
  );
}
