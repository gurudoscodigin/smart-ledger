import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Shield, Clock, Copy, Lock } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const users = [
  { name: "Você (Admin)", email: "admin@empresa.com", telegramId: "ID_001", role: "admin" as const },
  { name: "Maria Santos", email: "maria@empresa.com", telegramId: "ID_456", role: "supervisor" as const },
  { name: "João Lima", email: "joao@empresa.com", telegramId: "ID_789", role: "assistente" as const },
];

const auditLogs = [
  { action: "Alterou limite do cartão Roxinho para R$ 12.000", user: "Admin", time: "14:00", ip: "192.168.1.10" },
  { action: "Login bem-sucedido", user: "Maria Santos", time: "13:45", ip: "192.168.1.22" },
  { action: "Enviou comprovante Adobe", user: "João Lima", time: "12:30", ip: "Telegram" },
  { action: "Aprovou gasto Shopify R$ 350", user: "Maria Santos", time: "11:20", ip: "192.168.1.22" },
  { action: "Criou convite para novo membro", user: "Admin", time: "10:00", ip: "192.168.1.10" },
];

export default function ControlCenter() {
  const { role } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);

  const roleBadgeClass = (r: string) =>
    r === "admin" ? "bg-primary/15 text-primary" :
    r === "supervisor" ? "bg-role-supervisor/20 text-foreground" :
    "bg-muted text-muted-foreground";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Control Center</h1>
            <p className="text-muted-foreground text-sm mt-1">Segurança, permissões e auditoria</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-status-paid/10 text-status-paid border-0 gap-1">
              <Lock className="w-3 h-3" />
              Sessão Segura
            </Badge>
          </div>
        </div>

        {/* User Management */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Gestão de Usuários</CardTitle>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Gerar Convite
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar Novo Membro</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="p-4 bg-accent rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">Link de convite (expira em 24h)</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-background px-3 py-2 rounded border flex-1 truncate">
                        https://app.fincontrol.com/signup?token=a8f3b2...
                      </code>
                      <Button size="sm" variant="outline" onClick={() => toast.success("Link copiado!")}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O novo membro precisará vincular seu Telegram ID durante o primeiro acesso.
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {users.map((u, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center">
                      <Shield className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email} · {u.telegramId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className={`text-xs font-medium capitalize ${roleBadgeClass(u.role)}`}>
                      {u.role}
                    </Badge>
                    {u.role !== "admin" && (
                      <Select defaultValue={u.role}>
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="assistente">Assistente</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-medium">Logs de Auditoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {auditLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0">
                  <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{log.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {log.user} · {log.time} · IP: {log.ip}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
