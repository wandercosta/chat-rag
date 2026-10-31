import { Link } from "@tanstack/react-router";
import { Moon, Sun, LogOut, UserCog } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/session";

export function Topbar() {
  const { profile, userEmail, tenantName, scope, theme, toggleTheme, logout } = useSession();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <Badge variant="outline" className="gap-1.5">
        {profile}
        {scope === "tenant" && <span className="text-muted-foreground">· {tenantName}</span>}
      </Badge>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-sm text-muted-foreground sm:inline">{userEmail}</span>
        <Button variant="ghost" size="icon" asChild aria-label="Minha conta">
          <Link to="/conta">
            <UserCog />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => logout()} aria-label="Sair">
          <LogOut />
        </Button>
      </div>
    </header>
  );
}
