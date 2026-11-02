import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { AlertPrefs } from "./inbox-alerts";

/** Som e aviso do sistema para quem atende, guardados neste navegador. */
export function AlertPrefsButton({
  prefs,
  onChange,
}: {
  prefs: AlertPrefs;
  onChange: (prefs: AlertPrefs) => void;
}) {
  async function toggleDesktop(on: boolean) {
    if (!on) return onChange({ ...prefs, desktop: false });
    if (!("Notification" in window)) {
      toast.error("Este navegador não mostra avisos do sistema");
      return;
    }
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") {
      toast.error("O navegador bloqueou os avisos. Libere nas configurações do site.");
      return;
    }
    onChange({ ...prefs, desktop: true });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Bell />
          Avisos
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <p className="text-xs text-muted-foreground">
          Conversa nova na fila, resposta do cliente numa conversa sua e transferência para você.
          Vale só neste navegador.
        </p>
        <label className="flex items-center justify-between gap-2 text-sm">
          Tocar som
          <Switch
            checked={prefs.sound}
            onCheckedChange={(sound) => onChange({ ...prefs, sound })}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          Aviso do sistema com a aba em segundo plano
          <Switch checked={prefs.desktop} onCheckedChange={(on) => void toggleDesktop(on)} />
        </label>
      </PopoverContent>
    </Popover>
  );
}
