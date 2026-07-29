import { Moon, Sun, FlaskConical } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession, type Profile } from "@/lib/session";
import { tenants } from "@/lib/mock-data";

const profiles: Profile[] = ["Master", "Administrador", "Editor de base", "Analista"];

/**
 * Barra superior com o seletor de "sessão atual" (protótipo).
 * TODO(API): remover no produto final — escopo e perfil vêm do login real.
 */
export function Topbar() {
  const { profile, setProfile, tenantId, setTenantId, scope, theme, toggleTheme } = useSession();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/10 text-primary">
        <FlaskConical className="size-3" />
        Sessão simulada
      </Badge>
      <div className="ml-auto flex items-center gap-2">
        <Select value={profile} onValueChange={(v) => setProfile(v as Profile)}>
          <SelectTrigger className="w-[190px]" aria-label="Perfil simulado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p} value={p}>
                {p === "Master" ? "Master (plataforma)" : p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tenantId} onValueChange={setTenantId} disabled={scope === "master"}>
          <SelectTrigger className="w-[210px]" aria-label="Organização ativa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
}
