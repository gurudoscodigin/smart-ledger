import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTransacoes } from "@/hooks/useTransacoes";
import { ImportSpreadsheetDialog } from "@/components/ImportSpreadsheetDialog";

export default function ReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { data: txData, isLoading } = useTransacoes({ month, year });
  const [importOpen, setImportOpen] = useState(false);

  const allTx = [...(txData?.overdue || []), ...(txData?.currentMonth || [])];
  const pago = allTx.filter(t => t.status === "pago").reduce((s, t) => s + Number(t.valor), 0);
  const pendente = allTx.filter(t => t.status === "pendente").reduce((s, t) => s + Number(t.valor), 0);
  const atrasado = allTx.filter(t => t.status === "atrasado").reduce((s, t) => s + Number(t.valor), 0);
  const total = pago + pendente + atrasado;

  const byTipo: Record<string, number> = {};
  const byCat: Record<string, number> = {};
  for (const t of allTx) {
    byTipo[t.categoria_tipo] = (byTipo[t.categoria_tipo] || 0) + Number(t.valor);
    const catName = (t as any).categorias?.nome || "Sem categoria";
    byCat[catName] = (byCat[catName] || 0) + Number(t.valor);
  }

  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  const tipoLabel: Record<string, string> = { fixa: "🔒 Fixa", avulsa: "📝 Avulsa", variavel: "📊 Variável", divida: "💳 Dívida" };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise mensal de gastos e receitas</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Download className="w-4 h-4 mr-1.5" /> Importar Planilha
            </Button>
          </div>
        </div>

        {/* Month selector */}
        <div className="flex items-center justify-center gap-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-5 h-5" /></Button>
          <span className="text-lg font-medium min-w-[200px] text-center">{meses[month - 1]} {year}</span>
          <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-5 h-5" /></Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="glass-card">
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">R$ {fmt(total)}</p>
                  <p className="text-xs text-muted-foreground">{allTx.length} lançamentos</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">✅ Pago</p>
                  <p className="text-xl font-bold text-status-paid">R$ {fmt(pago)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">⏳ Pendente</p>
                  <p className="text-xl font-bold text-status-pending">R$ {fmt(pendente)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">🔴 Atrasado</p>
                  <p className="text-xl font-bold text-status-late">R$ {fmt(atrasado)}</p>
                </CardContent>
              </Card>
            </div>

            {/* By Type */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Por Tipo</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(byTipo).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(byTipo).sort((a, b) => b[1] - a[1]).map(([tipo, val]) => {
                      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                      return (
                        <div key={tipo}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{tipoLabel[tipo] || tipo}</span>
                            <span className="font-medium">R$ {fmt(val)} ({pct}%)</span>
                          </div>
                          <div className="h-2 bg-accent rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Category */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Por Categoria</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(byCat).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, val]) => {
                      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                      return (
                        <div key={cat} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                          <span className="text-sm">{cat}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{pct}%</Badge>
                            <span className="text-sm font-medium tabular-nums">R$ {fmt(val)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transaction list */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Detalhamento</CardTitle></CardHeader>
              <CardContent>
                {allTx.length === 0 ? (
                  <div className="text-center py-8">
                    <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Sem transações neste mês</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {allTx.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tx.descricao}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.data_vencimento).toLocaleDateString("pt-BR")}
                            {(tx as any).categorias?.nome && ` · ${(tx as any).categorias.nome}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium tabular-nums">R$ {fmt(Number(tx.valor))}</span>
                          <Badge variant="secondary" className={`text-[10px] ${
                            tx.status === "pago" ? "bg-status-paid/10 text-status-paid" :
                            tx.status === "atrasado" ? "bg-status-late/10 text-status-late" :
                            "bg-status-pending/10 text-status-pending"
                          }`}>
                            {tx.status === "pago" ? "Pago" : tx.status === "atrasado" ? "Atrasado" : "Pendente"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <ImportSpreadsheetDialog open={importOpen} onOpenChange={setImportOpen} />
    </DashboardLayout>
  );
}
