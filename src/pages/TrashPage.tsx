import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw, AlertTriangle, CreditCard, Receipt, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState } from "react";

export default function TrashPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmPermanent, setConfirmPermanent] = useState<{ id: string; type: "tx" | "card" } | null>(null);

  const { data: deletedTxs, isLoading: loadingTxs } = useQuery({
    queryKey: ["trash-transacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transacoes")
        .select("*, categorias(nome), cartoes(apelido, final_cartao)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: deletedCards, isLoading: loadingCards } = useQuery({
    queryKey: ["trash-cartoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cartoes")
        .select("*, bancos(nome)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const restoreTransaction = useMutation({
    mutationFn: async (txId: string) => {
      const tx = deletedTxs?.find(t => t.id === txId);
      if (!tx) throw new Error("Transação não encontrada");

      const { error } = await supabase
        .from("transacoes")
        .update({ deleted_at: null })
        .eq("id", txId);
      if (error) throw error;

      if (tx.cartao_id && tx.parcela_atual && tx.parcela_total && tx.status !== "pago") {
        const { data: cartao } = await supabase
          .from("cartoes")
          .select("limite_disponivel")
          .eq("id", tx.cartao_id)
          .single();

        if (cartao) {
          await supabase
            .from("cartoes")
            .update({ limite_disponivel: cartao.limite_disponivel - Number(tx.valor) })
            .eq("id", tx.cartao_id);
        }

        if (tx.descricao && tx.parcela_total > 1) {
          const baseDesc = tx.descricao.replace(/\s*\(\d+\/\d+\)$/, "");
          const { data: siblings } = await supabase
            .from("transacoes")
            .select("id, valor, status")
            .not("deleted_at", "is", null)
            .ilike("descricao", `${baseDesc}%`)
            .eq("cartao_id", tx.cartao_id);

          if (siblings?.length) {
            const siblingIds = siblings.map(s => s.id);
            await supabase
              .from("transacoes")
              .update({ deleted_at: null })
              .in("id", siblingIds);

            const unpaidTotal = siblings
              .filter(s => s.status !== "pago")
              .reduce((sum, s) => sum + Number(s.valor), 0);

            if (unpaidTotal > 0 && cartao) {
              const { data: updatedCard } = await supabase
                .from("cartoes")
                .select("limite_disponivel")
                .eq("id", tx.cartao_id)
                .single();
              if (updatedCard) {
                await supabase
                  .from("cartoes")
                  .update({ limite_disponivel: updatedCard.limite_disponivel - unpaidTotal })
                  .eq("id", tx.cartao_id);
              }
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      toast.success("Transação restaurada com sucesso");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreCard = useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase
        .from("cartoes")
        .update({ deleted_at: null })
        .eq("id", cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      toast.success("Cartão restaurado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Permanent delete
  const permanentDeleteTx = useMutation({
    mutationFn: async (txId: string) => {
      // Delete comprovantes first
      await supabase.from("comprovantes").delete().eq("transacao_id", txId);
      const { error } = await supabase.from("transacoes").delete().eq("id", txId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-transacoes"] });
      toast.success("Transação excluída permanentemente");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const permanentDeleteCard = useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.from("cartoes").delete().eq("id", cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-cartoes"] });
      toast.success("Cartão excluído permanentemente");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const daysUntilPermanent = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const expiry = new Date(deleted.getTime() + 30 * 86400000);
    const remaining = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
    return Math.max(0, remaining);
  };

  const isLoading = loadingTxs || loadingCards;
  const totalItems = (deletedTxs?.length || 0) + (deletedCards?.length || 0);

  // Items expiring soon (< 3 days)
  const expiringSoon = [
    ...(deletedTxs || []).filter(t => daysUntilPermanent(t.deleted_at!) <= 3),
    ...(deletedCards || []).filter(c => daysUntilPermanent(c.deleted_at!) <= 3),
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lixeira</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Itens excluídos são mantidos por 30 dias antes da remoção permanente
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {totalItems} {totalItems === 1 ? "item" : "itens"}
          </Badge>
        </div>

        {/* Expiring soon warning */}
        {expiringSoon.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-3 px-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-600">
                  {expiringSoon.length} item(ns) serão excluídos permanentemente em breve
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : totalItems === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <Trash2 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground">Lixeira vazia</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {deletedCards && deletedCards.length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Cartões Excluídos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {deletedCards.map((card) => {
                      const days = daysUntilPermanent(card.deleted_at!);
                      return (
                        <div key={card.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                              <CreditCard className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{card.apelido}</p>
                              <p className="text-xs text-muted-foreground">
                                •••• {card.final_cartao} · {card.bandeira} · {(card as any).bancos?.nome || "Sem banco"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${days <= 3 ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
                              {days > 0 ? `${days}d` : "Expirando"}
                            </span>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => restoreCard.mutate(card.id)} disabled={restoreCard.isPending}>
                              <RotateCcw className="w-3 h-3" /> Restaurar
                            </Button>
                            {role === "admin" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                                onClick={() => setConfirmPermanent({ id: card.id, type: "card" })}>
                                <XCircle className="w-3 h-3" /> Excluir
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {deletedTxs && deletedTxs.length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Receipt className="w-4 h-4" /> Transações Excluídas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {deletedTxs.map((tx) => {
                      const days = daysUntilPermanent(tx.deleted_at!);
                      const isInstallment = tx.parcela_atual && tx.parcela_total;
                      return (
                        <div key={tx.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                              <Receipt className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{tx.descricao}</p>
                              <p className="text-xs text-muted-foreground">
                                R$ {Number(tx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                {isInstallment && ` · Parcela ${tx.parcela_atual}/${tx.parcela_total}`}
                                {tx.cartoes && ` · ${(tx.cartoes as any).apelido}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isInstallment && (
                              <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                                Parcelamento
                              </Badge>
                            )}
                            <span className={`text-xs ${days <= 3 ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
                              {days > 0 ? `${days}d` : "!"}
                            </span>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => isInstallment ? setConfirmRestore(tx.id) : restoreTransaction.mutate(tx.id)}
                              disabled={restoreTransaction.isPending}>
                              <RotateCcw className="w-3 h-3" /> Restaurar
                            </Button>
                            {role === "admin" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                                onClick={() => setConfirmPermanent({ id: tx.id, type: "tx" })}>
                                <XCircle className="w-3 h-3" /> Excluir
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Confirm restore for installments */}
      <AlertDialog open={!!confirmRestore} onOpenChange={() => setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar parcelamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao restaurar uma parcela, todas as parcelas do mesmo parcelamento serão restauradas
              e o limite do cartão será reajustado automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmRestore) restoreTransaction.mutate(confirmRestore); setConfirmRestore(null); }}>
              Restaurar Tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm permanent delete */}
      <AlertDialog open={!!confirmPermanent} onOpenChange={() => setConfirmPermanent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O item será removido definitivamente do sistema e não poderá ser recuperado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmPermanent?.type === "tx") permanentDeleteTx.mutate(confirmPermanent.id);
                else if (confirmPermanent?.type === "card") permanentDeleteCard.mutate(confirmPermanent.id);
                setConfirmPermanent(null);
              }}>
              Excluir para sempre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
