import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Plus, Check, RotateCcw, Trash2 } from "lucide-react";
import { useLembretes } from "@/hooks/useLembretes";

export default function LembretesPage() {
  const { data: lembretes, isLoading, create, toggleConfirmado, remove, clearConfirmados } = useLembretes();
  const [createOpen, setCreateOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataLembrete, setDataLembrete] = useState("");

  const abertos = (lembretes || []).filter((l: any) => !l.confirmado);
  const confirmados = (lembretes || []).filter((l: any) => l.confirmado);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      titulo,
      descricao: descricao || undefined,
      data_lembrete: dataLembrete || undefined,
    });
    setTitulo("");
    setDescricao("");
    setDataLembrete("");
    setCreateOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lembretes</h1>
            <p className="text-muted-foreground text-sm mt-1">Acompanhe tarefas e lembretes</p>
          </div>
          <div className="flex gap-2">
            {confirmados.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => clearConfirmados.mutate()} disabled={clearConfirmados.isPending}>
                <Trash2 className="w-4 h-4 mr-1" /> Limpar confirmados
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Novo Lembrete
            </Button>
          </div>
        </div>

        <Tabs defaultValue="abertos">
          <TabsList>
            <TabsTrigger value="abertos" className="gap-1.5">
              <Bell className="w-4 h-4" /> Abertos ({abertos.length})
            </TabsTrigger>
            <TabsTrigger value="confirmados" className="gap-1.5">
              <Check className="w-4 h-4" /> Confirmados ({confirmados.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="abertos" className="space-y-3 pt-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : abertos.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="py-12 text-center">
                  <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhum lembrete aberto</p>
                </CardContent>
              </Card>
            ) : (
              abertos.map((l: any) => (
                <Card key={l.id} className="glass-card">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{l.titulo}</p>
                        {l.descricao && <p className="text-xs text-muted-foreground mt-0.5">{l.descricao}</p>}
                        {l.data_lembrete && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            📅 {new Date(l.data_lembrete + "T12:00:00").toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => toggleConfirmado.mutate({ id: l.id, confirmado: true })}>
                          <Check className="w-3 h-3" /> Confirmar
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => remove.mutate(l.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="confirmados" className="space-y-3 pt-4">
            {confirmados.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="py-12 text-center">
                  <Check className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhum lembrete confirmado</p>
                </CardContent>
              </Card>
            ) : (
              confirmados.map((l: any) => (
                <Card key={l.id} className="glass-card opacity-60">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm line-through">{l.titulo}</p>
                        {l.descricao && <p className="text-xs text-muted-foreground mt-0.5">{l.descricao}</p>}
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                        onClick={() => toggleConfirmado.mutate({ id: l.id, confirmado: false })}>
                        <RotateCcw className="w-3 h-3" /> Restaurar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Lembrete</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div>
              <Label>Título</Label>
              <Input placeholder="Ex: Renovar contrato" value={titulo} onChange={e => setTitulo(e.target.value)} required />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input placeholder="Detalhes..." value={descricao} onChange={e => setDescricao(e.target.value)} />
            </div>
            <div>
              <Label>Data (opcional)</Label>
              <Input type="date" value={dataLembrete} onChange={e => setDataLembrete(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "Salvando..." : "Criar Lembrete"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
