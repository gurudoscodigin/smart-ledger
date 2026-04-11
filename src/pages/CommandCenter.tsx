import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingDown, TrendingUp, FileText, ChevronLeft, ChevronRight, Landmark } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useTransacoes } from "@/hooks/useTransacoes";
import { useBancos } from "@/hooks/useBancos";

const BURN_COLORS = [
  "hsl(153, 50%, 45%)", "hsl(217, 70%, 55%)", "hsl(0, 65%, 55%)",
  "hsl(280, 65%, 55%)", "hsl(30, 80%, 55%)", "hsl(160, 60%, 45%)",
  "hsl(340, 65%, 55%)", "hsl(200, 70%, 50%)", "hsl(45, 80%, 50%)",
];

export default function CommandCenter() {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const isCurrentMonth = viewMonth === now.getMonth() + 1 && viewYear === now.getFullYear();

  const { data: txData, isLoading: txLoading } = useTransacoes({
    month: viewMonth,
    year: viewYear,
  });

  const { data: bancos } = useBancos();
  const saldoTotal = (bancos || []).reduce((sum, b) => sum + Number(b.saldo_atual), 0);

  const currentMonthTxs = txData?.currentMonth || [];
  const totalPago = currentMonthTxs.filter(t => t.status === "pago").reduce((s, t) => s + Number(t.valor), 0);
  const totalPendente = currentMonthTxs.filter(t => t.status === "pendente").reduce((s, t) => s + Number(t.valor), 0);
  const totalAtrasado = currentMonthTxs.filter(t => t.status === "atrasado").reduce((s, t) => s + Number(t.valor), 0);
  const totalAPagar = totalPendente + totalAtrasado;

  // Burn rate by category instead of status
  const burnData = useMemo(() => {
    const map = new Map<string, number>();
    currentMonthTxs.forEach(t => {
      const cat = (t as any).categorias?.nome || "Sem categoria";
      map.set(cat, (map.get(cat) || 0) + Number(t.valor));
    });
    return Array.from(map.entries())
      .map(([name, value], i) => ({ name, value, color: BURN_COLORS[i % BURN_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [currentMonthTxs]);

  const allTransactions = [
    ...(txData?.overdue || []).map(t => ({ ...t, _overdue: true })),
    ...currentMonthTxs,
  ];

  const goToPrevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const goToCurrentMonth = () => { setViewMonth(now.getMonth() + 1); setViewYear(now.getFullYear()); };

  const monthLabel = new Date(viewYear, viewMonth - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
            <p className="text-muted-foreground text-sm mt-1">Visão geral do seu fluxo de caixa</p>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <button onClick={goToCurrentMonth} className="text-lg font-semibold capitalize min-w-[200px] text-center hover:text-primary transition-colors">
            {monthLabel}
          </button>
          <Button variant="ghost" size="icon" onClick={goToNextMonth}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="outline" size="sm" className="text-xs ml-2" onClick={goToCurrentMonth}>Hoje</Button>
          )}
        </div>

        {/* Top Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Saldo Total</p>
                  <p className="text-2xl font-semibold mt-1">R$ {saldoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-status-paid/10 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-status-paid" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total a Pagar</p>
                  <p className="text-2xl font-semibold mt-1">R$ {totalAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-status-late/10 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-status-late" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Pago</p>
                  <p className="text-2xl font-semibold mt-1">R$ {totalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bank Balances */}
        {(bancos || []).length > 1 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(bancos || []).map(bank => (
              <Card key={bank.id} className="glass-card">
                <CardContent className="py-4 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Landmark className="w-3.5 h-3.5 text-primary" />
                    <p className="text-xs text-muted-foreground font-medium truncate">{bank.nome}</p>
                  </div>
                  <p className="text-base font-semibold tabular-nums">
                    R$ {Number(bank.saldo_atual).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Burn Rate Chart */}
          <Card className="glass-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base font-medium capitalize">Burn Rate — {monthLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <div className="flex items-center justify-center h-52">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : burnData.length > 0 ? (
                <div className="flex items-center justify-center gap-8">
                  <div className="w-52 h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={burnData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" strokeWidth={0}>
                          {burnData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {burnData.map((item) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-muted-foreground">{item.name}</span>
                        <span className="text-sm font-medium ml-auto">R$ {item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-border/30">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">Total</span>
                        <span className="text-sm font-semibold ml-auto">
                          R$ {(totalPago + totalPendente + totalAtrasado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">Nenhuma transação neste mês</div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base font-medium">Últimas Transações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {allTransactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{tx.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        R$ {Number(tx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        {" · "}
                        <span className={tx.status === "pago" ? "text-status-paid" : tx.status === "atrasado" ? "text-status-late" : "text-status-pending"}>
                          {tx.status === "pago" ? "Pago" : tx.status === "atrasado" ? "Atrasado" : "Pendente"}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
                {allTransactions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem atividades neste mês</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
