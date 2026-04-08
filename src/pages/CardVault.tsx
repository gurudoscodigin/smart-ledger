import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Wifi, Zap, Plus, Trash2 } from "lucide-react";
import { useCartoes } from "@/hooks/useCartoes";
import { useTransacoes } from "@/hooks/useTransacoes";
import { CreateCardDialog } from "@/components/CreateCardDialog";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function CardVault() {
  const { data: cartoes, isLoading, softDelete } = useCartoes();
  const { data: txData } = useTransacoes();
  const { role } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Group transactions by card for subscription timeline
  const cardTransactions = (txData?.currentMonth || []).filter(t => t.cartao_id);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Card Vault</h1>
            <p className="text-muted-foreground text-sm mt-1">Gestão de cartões e assinaturas</p>
          </div>
          {(role === "admin" || role === "supervisor") && (
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Novo Cartão
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !cartoes?.length ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <CreditCard className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum cartão cadastrado</p>
              <Button variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>Cadastrar primeiro cartão</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cartoes.map((card) => {
              const used = Number(card.limite_total) - Number(card.limite_disponivel);
              const usedPct = card.limite_total > 0 ? (used / Number(card.limite_total)) * 100 : 0;
              const barColor = usedPct > 80 ? "bg-status-late" : usedPct > 60 ? "bg-primary" : "bg-status-paid";

              return (
                <Card key={card.id} className="glass-card overflow-hidden">
                  <CardContent className="pt-6">
                    <div className="relative bg-gradient-to-br from-accent to-muted rounded-xl p-6 mb-6">
                      <div className="flex items-center justify-between mb-8">
                        <span className="text-sm font-medium text-foreground">{card.apelido}</span>
                        <div className="flex gap-2 items-center">
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                            {card.formato === "virtual" ? <><Zap className="w-3 h-3 mr-1" />Virtual</> : <><Wifi className="w-3 h-3 mr-1" />Físico</>}
                          </Badge>
                          {role === "admin" && (
                            <button onClick={() => setDeleteId(card.id)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Final</p>
                          <p className="text-lg font-mono font-semibold tracking-widest">•••• {card.final_cartao}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground font-medium capitalize">{card.bandeira}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{card.tipo_funcao}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Limite utilizado</span>
                        <span className="font-medium">
                          R$ {used.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / R$ {Number(card.limite_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="h-2 bg-accent rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Disponível: R$ {Number(card.limite_disponivel).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                        <span>Fecha dia {card.dia_fechamento} · Vence dia {card.dia_vencimento}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Subscription timeline from real transactions */}
        {cardTransactions.length > 0 && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base font-medium">Transações em Cartão — Mês Atual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {cardTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{tx.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.cartoes?.apelido} · {tx.parcela_atual && `${tx.parcela_atual}/${tx.parcela_total}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">R$ {Number(tx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      <Badge variant="secondary" className={
                        tx.status === "pago" ? "bg-status-paid/10 text-status-paid text-xs" :
                        tx.status === "atrasado" ? "bg-status-late/10 text-status-late text-xs" :
                        "bg-status-pending/10 text-status-pending text-xs"
                      }>
                        {tx.status === "pago" ? "Pago" : tx.status === "atrasado" ? "Atrasado" : "Pendente"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <CreateCardDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover para lixeira?</AlertDialogTitle>
            <AlertDialogDescription>O cartão ficará na lixeira por 30 dias antes de ser excluído permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) softDelete.mutate(deleteId); setDeleteId(null); }} className="bg-destructive text-destructive-foreground">
              Mover para Lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
