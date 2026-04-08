import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, CalendarClock, Zap, ToggleRight, Trash2 } from "lucide-react";
import { CreateRecorrenciaDialog } from "@/components/CreateRecorrenciaDialog";
import { CreateTransactionDialog } from "@/components/CreateTransactionDialog";
import { useRecorrencias } from "@/hooks/useRecorrencias";

export default function BillsPage() {
  const [recOpen, setRecOpen] = useState(false);
  const [avulsaOpen, setAvulsaOpen] = useState(false);
  const { data: recorrencias, isLoading, remove } = useRecorrencias();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cadastro de Contas</h1>
            <p className="text-muted-foreground text-sm mt-1">Gerencie contas fixas e registre contas avulsas</p>
          </div>
        </div>

        <Tabs defaultValue="fixas">
          <TabsList>
            <TabsTrigger value="fixas" className="gap-1.5">
              <CalendarClock className="w-4 h-4" /> Contas Fixas
            </TabsTrigger>
            <TabsTrigger value="avulsas" className="gap-1.5">
              <Zap className="w-4 h-4" /> Conta Avulsa
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fixas" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button onClick={() => setRecOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Nova Conta Fixa
              </Button>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : !recorrencias?.length ? (
              <Card className="glass-card">
                <CardContent className="py-12 text-center">
                  <CalendarClock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhuma conta fixa cadastrada</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">Cadastre suas contas recorrentes para o bot lançar automaticamente</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {recorrencias.map((rec: any) => (
                  <Card key={rec.id} className="glass-card">
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{rec.nome}</p>
                            {rec.eh_variavel && (
                              <Badge variant="outline" className="text-[10px] gap-1 border-status-overdue/30 text-status-overdue">
                                <ToggleRight className="w-3 h-3" /> Variável
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>Vence dia {rec.dia_vencimento_padrao}</span>
                            {rec.cartoes && <span>• {rec.cartoes.apelido}</span>}
                            {rec.bancos && <span>• {rec.bancos.nome}</span>}
                            {rec.categorias && <span>• {rec.categorias.nome}</span>}
                            {rec.origem && <span>• {rec.origem}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-medium tabular-nums">
                            {rec.eh_variavel ? "~" : ""}R$ {Number(rec.valor_estimado).toFixed(2)}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => remove.mutate(rec.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="avulsas" className="pt-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base font-medium">Registrar Conta Avulsa</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Contas avulsas são gastos pontuais, sem recorrência. Clique abaixo para registrar.
                </p>
                <Button onClick={() => setAvulsaOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" /> Nova Conta Avulsa
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <CreateRecorrenciaDialog open={recOpen} onOpenChange={setRecOpen} />
      <CreateTransactionDialog open={avulsaOpen} onOpenChange={setAvulsaOpen} />
    </DashboardLayout>
  );
}
