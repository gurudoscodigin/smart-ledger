import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useMemo } from "react";
import { useTransacoes } from "@/hooks/useTransacoes";
import { ImportSpreadsheetDialog } from "@/components/ImportSpreadsheetDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const TIPO_LABEL: Record<string, string> = { fixa: "🔒 Fixa", avulsa: "📝 Avulsa", variavel: "📊 Variável", divida: "💳 Dívida" };
const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const CAT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 220 70% 50%))",
  "hsl(var(--chart-3, 280 65% 55%))",
  "hsl(var(--chart-4, 30 80% 55%))",
  "hsl(var(--chart-5, 160 60% 45%))",
];

interface CatBreakdown {
  nome: string;
  total: number;
  pago: number;
  pendente: number;
  atrasado: number;
  items: Array<{ id: string; descricao: string; valor: number; status: string; data_vencimento: string; subcategoria: string | null }>;
  subcategorias: Record<string, { total: number; items: Array<{ id: string; descricao: string; valor: number; status: string; data_vencimento: string }> }>;
}

export default function ReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { data: txData, isLoading } = useTransacoes({ month, year });
  const [importOpen, setImportOpen] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const allTx = useMemo(() => [...(txData?.overdue || []), ...(txData?.currentMonth || [])], [txData]);

  const { pago, pendente, atrasado, total } = useMemo(() => {
    const p = allTx.filter(t => t.status === "pago").reduce((s, t) => s + Number(t.valor), 0);
    const pe = allTx.filter(t => t.status === "pendente").reduce((s, t) => s + Number(t.valor), 0);
    const a = allTx.filter(t => t.status === "atrasado").reduce((s, t) => s + Number(t.valor), 0);
    return { pago: p, pendente: pe, atrasado: a, total: p + pe + a };
  }, [allTx]);

  const byTipo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of allTx) m[t.categoria_tipo] = (m[t.categoria_tipo] || 0) + Number(t.valor);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [allTx]);

  const categories = useMemo(() => {
    const map = new Map<string, CatBreakdown>();
    for (const t of allTx) {
      const catName = (t as any).categorias?.nome || "Sem categoria";
      if (!map.has(catName)) map.set(catName, { nome: catName, total: 0, pago: 0, pendente: 0, atrasado: 0, items: [], subcategorias: {} });
      const c = map.get(catName)!;
      const val = Number(t.valor);
      c.total += val;
      if (t.status === "pago") c.pago += val;
      else if (t.status === "atrasado") c.atrasado += val;
      else c.pendente += val;
      const item = { id: t.id, descricao: t.descricao, valor: val, status: t.status, data_vencimento: t.data_vencimento, subcategoria: t.subcategoria };
      c.items.push(item);

      const subName = t.subcategoria || "Geral";
      if (!c.subcategorias[subName]) c.subcategorias[subName] = { total: 0, items: [] };
      c.subcategorias[subName].total += val;
      c.subcategorias[subName].items.push(item);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [allTx]);

  const toggleCat = (name: string) => {
    setExpandedCats(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  };
  const toggleSub = (key: string) => {
    setExpandedSubs(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };

  const statusBadge = (s: string) => {
    const cls = s === "pago" ? "bg-status-paid/10 text-status-paid" : s === "atrasado" ? "bg-status-late/10 text-status-late" : "bg-status-pending/10 text-status-pending";
    const label = s === "pago" ? "Pago" : s === "atrasado" ? "Atrasado" : "Pendente";
    return <Badge variant="secondary" className={`text-[10px] ${cls}`}>{label}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise mensal detalhada com drill-down</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Download className="w-4 h-4 mr-1.5" /> Importar
          </Button>
        </div>

        {/* Month selector */}
        <div className="flex items-center justify-center gap-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-5 h-5" /></Button>
          <span className="text-lg font-medium min-w-[200px] text-center">{MESES[month - 1]} {year}</span>
          <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-5 h-5" /></Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total", value: total, color: "", sub: `${allTx.length} lançamentos` },
                { label: "✅ Pago", value: pago, color: "text-status-paid" },
                { label: "⏳ Pendente", value: pendente, color: "text-status-pending" },
                { label: "🔴 Atrasado", value: atrasado, color: "text-status-late" },
              ].map(c => (
                <Card key={c.label} className="glass-card">
                  <CardContent className="pt-5">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className={`text-xl font-bold ${c.color}`}>R$ {fmt(c.value)}</p>
                    {c.sub && <p className="text-xs text-muted-foreground">{c.sub}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Category visual bar */}
            {total > 0 && (
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-base">Distribuição por Categoria</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-6 rounded-full overflow-hidden flex bg-accent">
                    {categories.map((c, i) => {
                      const pct = (c.total / total) * 100;
                      if (pct < 1) return null;
                      return (
                        <div
                          key={c.nome}
                          className="h-full transition-all relative group"
                          style={{ width: `${pct}%`, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }}
                        >
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-2 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                            {c.nome}: {Math.round(pct)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3">
                    {categories.map((c, i) => (
                      <div key={c.nome} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />
                        <span>{c.nome}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* By Type */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Por Tipo</CardTitle></CardHeader>
              <CardContent>
                {byTipo.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados</p> : (
                  <div className="space-y-3">
                    {byTipo.map(([tipo, val]) => {
                      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                      return (
                        <div key={tipo}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{TIPO_LABEL[tipo] || tipo}</span>
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

            {/* Drill-down by Category */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Detalhamento por Categoria</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {categories.length === 0 ? (
                  <div className="text-center py-8">
                    <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Sem transações neste mês</p>
                  </div>
                ) : categories.map((cat, ci) => (
                  <Collapsible key={cat.nome} open={expandedCats.has(cat.nome)} onOpenChange={() => toggleCat(cat.nome)}>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CAT_COLORS[ci % CAT_COLORS.length] }} />
                          <span className="text-sm font-medium">{cat.nome}</span>
                          <Badge variant="secondary" className="text-[10px]">{cat.items.length} itens</Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-bold tabular-nums">R$ {fmt(cat.total)}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {total > 0 ? Math.round((cat.total / total) * 100) : 0}% do total
                            </p>
                          </div>
                          {expandedCats.has(cat.nome) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-6 border-l-2 border-border/50 pl-4 pb-2">
                        {/* Status mini-summary */}
                        <div className="flex gap-4 py-2 text-xs text-muted-foreground">
                          {cat.pago > 0 && <span className="text-status-paid">✅ R$ {fmt(cat.pago)}</span>}
                          {cat.pendente > 0 && <span className="text-status-pending">⏳ R$ {fmt(cat.pendente)}</span>}
                          {cat.atrasado > 0 && <span className="text-status-late">🔴 R$ {fmt(cat.atrasado)}</span>}
                        </div>

                        {/* Subcategory groups */}
                        {Object.entries(cat.subcategorias).sort((a, b) => b[1].total - a[1].total).map(([subName, sub]) => {
                          const subKey = `${cat.nome}::${subName}`;
                          const hasMultiple = Object.keys(cat.subcategorias).length > 1;
                          return (
                            <div key={subKey}>
                              {hasMultiple && (
                                <Collapsible open={expandedSubs.has(subKey)} onOpenChange={() => toggleSub(subKey)}>
                                  <CollapsibleTrigger className="w-full">
                                    <div className="flex items-center justify-between py-2 px-1 hover:bg-accent/30 rounded transition-colors">
                                      <span className="text-xs font-medium text-muted-foreground">{subName}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium tabular-nums">R$ {fmt(sub.total)}</span>
                                        {expandedSubs.has(subKey) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </div>
                                    </div>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="ml-3 space-y-0.5">
                                      {sub.items.sort((a, b) => b.valor - a.valor).map(item => (
                                        <div key={item.id} className="flex items-center justify-between py-1.5 text-xs">
                                          <div className="flex-1 min-w-0">
                                            <span className="truncate block">{item.descricao}</span>
                                            <span className="text-muted-foreground">{new Date(item.data_vencimento).toLocaleDateString("pt-BR")}</span>
                                          </div>
                                          <div className="flex items-center gap-2 ml-2">
                                            <span className="font-medium tabular-nums">R$ {fmt(item.valor)}</span>
                                            {statusBadge(item.status)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                              {!hasMultiple && sub.items.sort((a, b) => b.valor - a.valor).map(item => (
                                <div key={item.id} className="flex items-center justify-between py-1.5 text-xs">
                                  <div className="flex-1 min-w-0">
                                    <span className="truncate block">{item.descricao}</span>
                                    <span className="text-muted-foreground">{new Date(item.data_vencimento).toLocaleDateString("pt-BR")}</span>
                                  </div>
                                  <div className="flex items-center gap-2 ml-2">
                                    <span className="font-medium tabular-nums">R$ {fmt(item.valor)}</span>
                                    {statusBadge(item.status)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <ImportSpreadsheetDialog open={importOpen} onOpenChange={setImportOpen} />
    </DashboardLayout>
  );
}
