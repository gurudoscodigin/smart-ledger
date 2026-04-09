import { LayoutDashboard, CreditCard, Settings, LogOut, Lock, Trash2, Receipt, BarChart3, FolderTree } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Command Center", url: "/", icon: LayoutDashboard },
  { title: "Contas", url: "/bills", icon: Receipt },
  { title: "Card Vault", url: "/cards", icon: CreditCard },
  { title: "Relatórios", url: "/reports", icon: BarChart3 },
  { title: "Categorias", url: "/categorias", icon: FolderTree },
  { title: "Control Center", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, role } = useAuth();

  const roleBadge = role === "admin" ? "bg-primary/15 text-primary" : role === "supervisor" ? "bg-role-supervisor/20 text-foreground" : "bg-muted text-muted-foreground";
  const roleLabel = role === "admin" ? "Admin" : role === "supervisor" ? "Supervisor" : "Assistente";

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarContent className="pt-6">
        {!collapsed && (
          <div className="px-4 mb-6 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lock className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">FinControl</span>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-accent/60 transition-colors"
                      activeClassName="bg-accent text-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/trash"
                    className="hover:bg-accent/60 transition-colors text-muted-foreground"
                    activeClassName="bg-accent text-foreground font-medium"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Lixeira</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="mb-2 px-2">
            <Badge variant="secondary" className={`text-xs font-medium ${roleBadge}`}>
              {roleLabel}
            </Badge>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="text-muted-foreground hover:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
