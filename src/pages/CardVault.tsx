import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Wifi, Zap, Plus, Trash2, Building2, ChevronDown, ChevronUp, AlertCircle, Landmark } from "lucide-react";
import { useCartoes } from "@/hooks/useCartoes";
import { useBancos } from "@/hooks/useBancos";
import { useTransacoes } from "@/hooks/useTransacoes";
import { CreateCardDialog } from "@/components/CreateCardDialog";
import { CreateBankDialog } from "@/components/CreateBankDialog";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function CardVault() {
  const { data: cartoes, isLoading, softDelete } = useCartoes();
  const { data: bancos } = useBancos();
  const { data: txData } = useTransacoes();
  const { role } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [createBankOpen, setCreateBankOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedBanks, setExpandedBanks] = useState<Set<string>>(new Set(["__unlinked"]));

  const toggleBank = (bankId: string) => {
    setExpandedBanks(prev => {
      const next = new Set(prev);
      next.has(bankId) ? next.delete(bankId) : next.add(bankId);
      return next;
    });
  };

  // Group cards by bank
  const bankGroups = new Map<string, { bank: any; cards: any[] }>();
  const unlinkedCards: any[] = [];

  (cartoes || []).forEach(card => {
    if (card.banco_id && (card as any).bancos) {
      const existing = bankGroups.get(card.banco_id);
      if (existing) {
        existing.cards.push(card);
      } else {
        bankGroups.set(card.banco_id, { bank: (card as any).bancos, cards: [card] });
      }
    } else {
      unlinkedCards.push(card);
    }
  });

  // Calculate bank-level aggregates
  const getBankFatura = (cards: any[]) => {
    const cardIds = cards.map(c => c.id);
    const monthTxs = (txData?.currentMonth || []).filter(t => t.cartao_id && cardIds.includes(t.cartao_id));
    return monthTxs.reduce((sum, t) => sum + Number(t.valor), 0);
  };

  // Check for expiring virtual cards (30 days)
  const isExpiringSoon = (card: any) => {
    if (!card.data_validade || card.formato !== "virtual") return false;
    const expiry = new Date(card.data_validade);
    const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
    return daysLeft > 0 && daysLeft <= 30;
  };

  const cardTransactions = (txData?.currentMonth || []).filter(t => t.cartao_id);

  const renderCard = (card: any) => {
    const used = Number(card.limite_total) - Number(card.limite_disponivel);
    const usedPct = card.limite_total > 0 ? (used / Number(card.limite_total)) * 100 : 0;
    const barColor = usedPct > 80 ? "bg-status-late" : usedPct > 60 ? "bg-primary" : "bg-status-paid";
    const expiring = isExpiringSoon(card);

    return (
      <Card key={card.id} className={`glass-card overflow-hidden ${expiring ? "ring-1 ring-primary/40" : ""}`}>
        <CardContent className="pt-6">
          <div className="relative bg-gradient-to-br from-accent to-muted rounded-xl p-6 mb-6">
            {expiring && (
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="text-[10px] bg-primary/20 text-primary gap-1">
                  <AlertCircle className="w-3 h-3" /> Expira em breve
                </Badge>
              </div>
            )}
            <div className="flex items-center justify-between mb-8">
              <span className="text-sm font-medium text-foreground">{card.apelido}</span>
              <div className="flex gap-2 items-center">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  {card.formato === "virtual"
                    ? <><Zap className="w-3 h-3 mr-1" />Virtual</>
                    : <><Wifi className="w-3 h-3 mr-1" />Físico</>
                  }
                </Badge>
                {card.id_cartao_pai && (
                  <Badge variant="outline" className="text-[10px]">Adicional</Badge>
                )}
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
            {card.data_validade && (
              <p className="text-[10px] text-muted-foreground">
                Validade: {new Date(card.data_validade).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Card Vault</h1>
            <p className="text-muted-foreground text-sm mt-1">Gestão de cartões e assinaturas</p>
          </div>
          {(role === "admin" || role === "supervisor") && (
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setCreateBankOpen(true)}>
                <Landmark className="w-4 h-4" /> Novo Banco
              </Button>
              <Button className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" /> Novo Cartão
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !cartoes?.length && !bancos?.length ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <CreditCard className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum banco ou cartão cadastrado</p>
              <Button variant="outline" className="mt-4" onClick={() => setCreateBankOpen(true)}>Cadastrar primeiro banco</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* All banks — with or without cards */}
            {(bancos || []).map(bank => {
              const cards = bankGroups.get(bank.id)?.cards || [];
              const faturaTotal = getBankFatura(cards);
              const isOpen = expandedBanks.has(bank.id);

              return (
                <Collapsible key={bank.id} open={isOpen} onOpenChange={() => toggleBank(bank.id)}>
                  <Card className="glass-card">
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors rounded-t-xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-base font-medium">{bank.nome}</CardTitle>
                              <p className="text-xs text-muted-foreground">
                                {cards.length} {cards.length === 1 ? "cartão" : "cartões"} · Saldo: R$ {Number(bank.saldo_atual).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {cards.length > 0 && (
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Fatura atual</p>
                                <p className="text-sm font-semibold">R$ {faturaTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                              </div>
                            )}
                            {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        {cards.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {cards.map(renderCard)}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-6">Nenhum cartão vinculado a este banco</p>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}

            {/* Unlinked cards */}
            {unlinkedCards.length > 0 && (
              <Collapsible open={expandedBanks.has("__unlinked")} onOpenChange={() => toggleBank("__unlinked")}>
                <Card className="glass-card">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors rounded-t-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <CreditCard className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <CardTitle className="text-base font-medium">Sem Banco Vinculado</CardTitle>
                            <p className="text-xs text-muted-foreground">{unlinkedCards.length} {unlinkedCards.length === 1 ? "cartão" : "cartões"}</p>
                          </div>
                        </div>
                        {expandedBanks.has("__unlinked") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {unlinkedCards.map(renderCard)}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
          </div>
        )}

        {/* Card transactions */}
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
                          {(tx as any).cartoes?.apelido} · {tx.parcela_atual && `${tx.parcela_atual}/${tx.parcela_total}`}
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
      <CreateBankDialog open={createBankOpen} onOpenChange={setCreateBankOpen} />

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
