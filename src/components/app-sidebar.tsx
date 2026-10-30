import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  Building2,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Library,
  MessageSquare,
  ScrollText,
  Settings,
  Users,
  SearchX,
  FlaskConical,
  Inbox,
  Contact,
  RadioTower,
  Megaphone,
  Workflow,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSession, type Permission } from "@/lib/session";

type Item = {
  title: string;
  url: string;
  icon: typeof Bot;
  perm?: Permission;
  masterOnly?: boolean;
};

const tenantItems: Item[] = [
  { title: "Visão geral do tenant", url: "/", icon: LayoutDashboard },
  { title: "Assistentes", url: "/assistentes", icon: Bot, perm: "assistants" },
  { title: "Base de conhecimento", url: "/conhecimento", icon: Library, perm: "knowledge" },
  { title: "Playground", url: "/playground", icon: FlaskConical, perm: "assistants" },
  { title: "Caixa de entrada", url: "/atendimento", icon: Inbox, perm: "inbox" },
  { title: "Contatos", url: "/contatos", icon: Contact, perm: "contacts" },
  { title: "Campanhas", url: "/campanhas", icon: Megaphone, perm: "campaigns" },
  { title: "Automações", url: "/automacoes", icon: Workflow, perm: "automations" },
  { title: "Conversas", url: "/conversas", icon: MessageSquare, perm: "conversations" },
  { title: "Lacunas e feedbacks", url: "/lacunas", icon: SearchX, perm: "gaps" },
  { title: "Canais", url: "/canais", icon: RadioTower, perm: "channels" },
  { title: "Integrações e widget", url: "/integracoes", icon: KeyRound, perm: "integrations" },
  { title: "Usuários e permissões", url: "/usuarios", icon: Users, perm: "users" },
  { title: "Configurações", url: "/configuracoes", icon: Settings, perm: "settings" },
  { title: "Auditoria e uso", url: "/auditoria", icon: ScrollText, perm: "audit" },
];

const masterItems: Item[] = [
  { title: "Organizações/tenants", url: "/tenants", icon: Building2, masterOnly: true },
  { title: "Visão geral da plataforma", url: "/plataforma", icon: Gauge, masterOnly: true },
];

export function AppSidebar() {
  const { can, scope } = useSession();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  const visibleTenant = tenantItems.filter((i) => !i.perm || can(i.perm));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Activity className="size-4" />
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">ChatRAG</p>
            <p className="truncate text-xs text-muted-foreground">Painel administrativo</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {scope === "master" && (
          <SidebarGroup>
            <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {masterItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Organização</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleTenant.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
