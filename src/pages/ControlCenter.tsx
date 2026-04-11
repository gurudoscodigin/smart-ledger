import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { UserPlus, Shield, Clock, Lock, AlertTriangle, Mail, User, Eye, EyeOff, Pencil, Trash2, Settings } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PERMISSIONS_LIST = [
  { key: "view_reports", label: "Visualizar relatórios financeiros" },
  { key: "create_transactions", label: "Cadastrar novas contas" },
  { key: "edit_transactions", label: "Editar contas existentes" },
  { key: "delete_transactions", label: "Excluir contas" },
  { key: "manage_categories", label: "Gerenciar categorias" },
  { key: "access_settings", label: "Acessar configurações do sistema" },
  { key: "approve_requests", label: "Aprovar/reprovar solicitações" },
  { key: "manual_adjustments", label: "Fazer ajustes manuais" },
];

export default function ControlCenter() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [permissionsUserId, setPermissionsUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<{ user_id: string; display_name: string | null; role: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("assistente");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<string>("assistente");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  // Local permissions state per user (stored in localStorage until we add a DB table)
  const [userPermissions, setUserPermissions] = useState<Record<string, Record<string, boolean>>>(() => {
    try { return JSON.parse(localStorage.getItem("user_permissions") || "{}"); } catch { return {}; }
  });

  const savePermissions = (userId: string, perms: Record<string, boolean>) => {
    const updated = { ...userPermissions, [userId]: perms };
    setUserPermissions(updated);
    localStorage.setItem("user_permissions", JSON.stringify(updated));
  };

  const { data: users } = useQuery({
    queryKey: ["control-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase.from("profiles").select("user_id, display_name, telegram_id");
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
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
      const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(20);
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
        email: newEmail, password: newPassword,
        options: { data: { display_name: newName, requested_role: newRole }, emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Usuário criado! E-mail de confirmação enviado.");
      setCreateOpen(false);
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("assistente");
      queryClient.invalidateQueries({ queryKey: ["control-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
  };

  const updateProfile = useMutation({
    mutationFn: async ({ userId, displayName, newRole }: { userId: string; displayName: string; newRole: string }) => {
      const { error: pErr } = await supabase.from("profiles").update({ display_name: displayName }).eq("user_id", userId);
      if (pErr) throw pErr;
      const { error: rErr } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["control-users"] });
      toast.success("Usuário atualizado");
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      if (userId === user?.id) {
        throw new Error("Você não pode excluir sua própria conta");
      }
      const { error: rErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (rErr) throw rErr;
      const { data: pData, error: pErr } = await supabase
        .from("profiles")
        .update({ display_name: "[Removido]" })
        .eq("user_id", userId)
        .select("id");
      if (pErr) throw pErr;
      if (!pData || pData.length === 0) {
        throw new Error("Falha ao atualizar profile — verifique permissões admin");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["control-users"] });
      toast.success("Usuário removido (dados históricos preservados)");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (u: { user_id: string; display_name: string | null; role: string }) => {
    setEditingUser(u);
    setEditName(u.display_name || "");
    setEditRole(u.role);
    setEditOpen(true);
  };

  const roleBadgeClass = (r: string) => r === "admin" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground";

  const permissions = [
    { action: "Ver saldo total", admin: true, assistente: false },
    { action: "Criar/editar transações", admin: true, assistente: true },
    { action: "Deletar transações", admin: true, assistente: false },
    { action: "Gerenciar cartões e bancos", admin: true, assistente: false },
    { action: "Alterar limites", admin: true, assistente: false },
    { action: "Aprovar lançamentos", admin: true, assistente: false },
    { action: "Gerenciar usuários", admin: true, assistente: false },
    { action: "Ver logs de auditoria", admin: true, assistente: false },
    { action: "Configurar APIs e Drive", admin: true, assistente: false },
    { action: "Importar planilhas", admin: true, assistente: false },
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

  const permUser = users?.find(u => u.user_id === permissionsUserId);
  const currentPerms = permissionsUserId ? (userPermissions[permissionsUserId] || {}) : {};

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
          <CardHeader><CardTitle className="text-base font-medium">Matriz de Permissões</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Ação</th>
                    <th className="text-center py-2 px-3 font-medium"><Badge className={`text-xs ${roleBadgeClass("admin")}`}>Admin</Badge></th>
                    <th className="text-center py-2 px-3 font-medium"><Badge className={`text-xs ${roleBadgeClass("assistente")}`}>Assistente</Badge></th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((p, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0">
                      <td className="py-2.5 pr-4">{p.action}</td>
                      <td className="text-center py-2.5">{p.admin ? "✅" : "❌"}</td>
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
                <Button size="sm" className="gap-2"><UserPlus className="w-4 h-4" /> Novo Usuário</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Criar Novo Usuário</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateUser} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Nome Completo</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Nome completo" value={newName} onChange={e => setNewName(e.target.value)} className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type="email" placeholder="email@exemplo.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type={showPassword ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pl-10 pr-10" minLength={8} required />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Função</Label>
                    <Select value={newRole} onValueChange={setNewRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="assistente">Assistente</SelectItem>
                      </SelectContent>
                    </Select>
                    {newRole === "admin" && (
                      <p className="text-xs text-amber-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Acesso total ao sistema.</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={creating}>{creating ? "Criando..." : "Criar Usuário"}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {(users || []).filter(u => u.display_name !== '[Removido]').map(u => (
                <div key={u.user_id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center">
                      <Shield className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{u.display_name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.user_id === user?.id ? "Você" : `Função: ${u.role}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={`text-xs font-medium capitalize ${roleBadgeClass(u.role)}`}>{u.role}</Badge>
                    {u.user_id !== user?.id && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)} title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPermissionsUserId(u.user_id)} title="Permissões">
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover {u.display_name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O acesso será revogado, mas todos os dados históricos (transações, logs) serão preservados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUser.mutate(u.user_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Edit User Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent aria-describedby="edit-user-desc">
            <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
            <p id="edit-user-desc" className="text-sm text-muted-foreground">Altere o nome e cargo do usuário.</p>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="assistente">Assistente</SelectItem>
                  </SelectContent>
                </Select>
                {editRole === "admin" && (
                  <p className="text-xs text-amber-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Acesso total ao sistema.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => editingUser && updateProfile.mutate({ userId: editingUser.user_id, displayName: editName, newRole: editRole })}
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Permissions Dialog */}
        <Dialog open={!!permissionsUserId} onOpenChange={(o) => { if (!o) setPermissionsUserId(null); }}>
          <DialogContent className="sm:max-w-md" aria-describedby="perm-desc">
            <DialogHeader>
              <DialogTitle>Permissões — {permUser?.display_name || "Usuário"}</DialogTitle>
            </DialogHeader>
            <p id="perm-desc" className="text-sm text-muted-foreground">Ative ou desative permissões individuais para este usuário.</p>
            <div className="space-y-3 py-2">
              {PERMISSIONS_LIST.map(perm => (
                <div key={perm.key} className="flex items-center justify-between">
                  <Label className="text-sm">{perm.label}</Label>
                  <Switch
                    checked={currentPerms[perm.key] ?? false}
                    onCheckedChange={(checked) => {
                      if (permissionsUserId) {
                        savePermissions(permissionsUserId, { ...currentPerms, [perm.key]: checked });
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => { setPermissionsUserId(null); toast.success("Permissões salvas"); }}>Fechar</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Audit Logs */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base font-medium">Logs de Auditoria</CardTitle></CardHeader>
          <CardContent>
            {!auditLogs?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum log registrado ainda</p>
            ) : (
              <div className="space-y-1">
                {auditLogs.map(log => (
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
