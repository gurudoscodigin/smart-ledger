import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Shield, Clock, Lock, AlertTriangle, Mail, User, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ControlCenter() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<string>("assistente");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: users } = useQuery({
    queryKey: ["control-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, telegram_id");
      if (error) throw error;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");
      return (profiles || []).map(p => ({
        ...p,
        role: roles?.find(r => r.user_id === p.user_id)?.role || "assistente",
      }));
    },
    enabled: !!user && role === "admin",
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && role === "admin",
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: {
          data: { display_name: newName, requested_role: newRole },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      toast.success("Usuário criado com sucesso! E-mail de confirmação enviado.");
      setCreateOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("assistente");
      queryClient.invalidateQueries({ queryKey: ["control-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
  };

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole as any })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["control-users"] });
      toast.success("Papel atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleBadgeClass = (r: string) =>
    r === "admin" ? "bg-primary/15 text-primary" :
    r === "supervisor" ? "bg-role-supervisor/20 text-foreground" :
    "bg-muted text-muted-foreground";

  const permissions = [
    { action: "Ver saldo total", admin: true, supervisor: true, assistente: false },
    { action: "Criar/editar transações", admin: true, supervisor: true, assistente: true },
    { action: "Deletar transações", admin: true, supervisor: false, assistente: false },
    { action: "Gerenciar cartões e bancos", admin: true, supervisor: false, assistente: false },
    { action: "Alterar limites", admin: true, supervisor: false, assistente: false },
    { action: "Aprovar lançamentos", admin: true, supervisor: true, assistente: false },
    { action: "Gerenciar usuários", admin: true, supervisor: false, assistente: false },
    { action: "Ver logs de auditoria", admin: true, supervisor: true, assistente: false },
    { action: "Configurar APIs e Drive", admin: true, supervisor: false, assistente: false },
    { action: "Importar planilhas", admin: true, supervisor: true, assistente: false },
  ];

  if (role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Card className="glass-card max-w-md">
            <CardContent className="py-12 text-center">
              <Lock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Acesso restrito ao Administrador</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Control Center</h1>
            <p className="text-muted-foreground text-sm mt-1">Segurança, permissões e auditoria</p>
          </div>
          <Badge className="bg-status-paid/10 text-status-paid border-0 gap-1">
            <Lock className="w-3 h-3" /> Sessão Segura
          </Badge>
        </div>

        {/* Permission Matrix */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-medium">Matriz de Permissões</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Ação</th>
                    <th className="text-center py-2 px-3 font-medium">
                      <Badge className={`text-xs ${roleBadgeClass("admin")}`}>Admin</Badge>
                    </th>
                    <th className="text-center py-2 px-3 font-medium">
                      <Badge className={`text-xs ${roleBadgeClass("supervisor")}`}>Supervisor</Badge>
                    </th>
                    <th className="text-center py-2 px-3 font-medium">
                      <Badge className={`text-xs ${roleBadgeClass("assistente")}`}>Assistente</Badge>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((p, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0">
                      <td className="py-2.5 pr-4">{p.action}</td>
                      <td className="text-center py-2.5">{p.admin ? "✅" : "❌"}</td>
                      <td className="text-center py-2.5">{p.supervisor ? "✅" : "❌"}</td>
                      <td className="text-center py-2.5">{p.assistente ? "✅" : "❌"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* User Management */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Gestão de Usuários</CardTitle>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <UserPlus className="w-4 h-4" /> Novo Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Usuário</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateUser} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Nome Completo</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Nome completo" value={newName} onChange={(e) => setNewName(e.target.value)} className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type="email" placeholder="email@exemplo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type={showPassword ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="pl-10 pr-10" minLength={8} required />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Função</Label>
                    <Select value={newRole} onValueChange={setNewRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="supervisor">Supervisor</SelectItem>
                        <SelectItem value="assistente">Assistente</SelectItem>
                      </SelectContent>
                    </Select>
                    {newRole === "admin" && (
                      <p className="text-xs text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Esse usuário terá acesso total ao sistema.
                      </p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={creating}>
                    {creating ? "Criando..." : "Criar Usuário"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {(users || []).map((u) => (
                <div key={u.user_id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center">
                      <Shield className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{u.display_name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.telegram_id ? `📱 ${u.telegram_id}` : "⚠️ Telegram não vinculado"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className={`text-xs font-medium capitalize ${roleBadgeClass(u.role)}`}>
                      {u.role}
                    </Badge>
                    {u.role !== "admin" && u.user_id !== user?.id && (
                      <Select defaultValue={u.role} onValueChange={(v) => updateRole.mutate({ userId: u.user_id, newRole: v })}>
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
            {!auditLogs?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum log registrado ainda</p>
            ) : (
              <div className="space-y-1">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium capitalize">{log.action}</span> em <span className="text-primary">{log.table_name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(log.created_at).toLocaleString("pt-BR")}
                        {log.ip_address && ` · IP: ${log.ip_address}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}