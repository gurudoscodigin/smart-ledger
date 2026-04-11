import { useState, useRef, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CalendarClock, Zap, ToggleRight, Trash2, Paperclip, FileText, Image, CreditCard, TrendingUp, AlertTriangle, Clock, Check, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CreateTransactionDialog } from "@/components/CreateTransactionDialog";
import { CreateDividaDialog } from "@/components/CreateDividaDialog";
import { PayVariableDialog } from "@/components/PayVariableDialog";
import { PayWithReceiptDialog } from "@/components/PayWithReceiptDialog";
import { useTransacoes } from "@/hooks/useTransacoes";
import { useComprovantes } from "@/hooks/useComprovantes";
import { useCategorias } from "@/hooks/useCategorias";
import { useSubcategorias } from "@/hooks/useSubcategorias";
import { useBancos } from "@/hooks/useBancos";
import { useCartoes } from "@/hooks/useCartoes";
import { useContratosDivida, useParcelasContrato } from "@/hooks/useContratosDivida";
import { AmortizacaoDialog } from "@/components/AmortizacaoDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

function AttachSection({ transacaoId }: { transacaoId: string }) {
  const { data: comprovantes, upload } = useComprovantes(transacaoId);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 5MB)"); return; }
    upload.mutate({ transacaoId, file });
    e.target.value = "";
  };

  const getFileIcon = (type: string | null) => {
    if (type?.startsWith("image/")) return <Image className="w-3 h-3" />;
    return <FileText className="w-3 h-3" />;
  };

  const getFileUrl = (path: string) => {
    const { data } = supabase.storage.from("comprovantes").getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="flex items-center gap-1.5">
      {(comprovantes || []).map((c: any) => (
        <Tooltip key={c.id}>
          <TooltipTrigger asChild>
            <a href={getFileUrl(c.file_path)} target="_blank" rel="noopener noreferrer"
              className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-accent/80 transition-colors">
              {getFileIcon(c.file_type)}
            </a>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{c.file_name}</TooltipContent>
        </Tooltip>
      ))}
      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handleFile} />
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"
        onClick={() => fileRef.current?.click()} disabled={upload.isPending} title="Anexar comprovante ou NFe">
        <Paperclip className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function useHasComprovante(transacaoIds: string[]) {
  return useQuery({
    queryKey: ["comprovantes-check", transacaoIds.sort().join(",")],
    queryFn: async () => {
      if (!transacaoIds.length) return new Set<string>();
      const { data } = await supabase
        .from("comprovantes")
        .select("transacao_id")
        .in("transacao_id", transacaoIds);
      return new Set((data || []).map(c => c.transacao_id));
    },
    enabled: transacaoIds.length > 0,
  });
}

function formatTxTags(tx: any) {
  const parts: string[] = [];
  if (tx.data_pagamento) {
    parts.push(new Date(tx.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR"));
  } else if (tx.data_vencimento) {
    parts.push(new Date(tx.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR"));
  } else {
    parts.push("—");
  }
  if (tx.cartoes) {
    parts.push(`Cartão final ${tx.cartoes.final_cartao}`);
  } else if (tx.bancos) {
    parts.push(tx.bancos.nome);
  } else {
    parts.push("—");
  }
  parts.push(tx.categorias?.nome || "—");
  parts.push(tx.subcategoria || "—");
  return parts.join(" — ");
}

// Parcelas viewer dialog
function ParcelasDialog({ contratoId, contratoNome, open, onOpenChange }: { contratoId: string | null; contratoNome: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: parcelas, isLoading } = useParcelasContrato(contratoId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Parcelas — {contratoNome}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : !parcelas?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma parcela encontrada</p>
          ) : (
            <div className="space-y-2">
              {parcelas.map((p: any) => {
                const [y, m, d] = p.data_vencimento.split("-");
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {p.status === "pago" ? "✅" : p.status === "atrasado" ? "🔴" : "⏳"}
                      </span>
                      <span className="text-sm font-medium">{p.parcela_atual}/{p.parcela_total}</span>
                      <span className="text-xs text-muted-foreground">{d}/{m}/{y}</span>
                    </div>
                    <span className="text-sm font-medium tabular-nums">R$ {Number(p.valor).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function BillsPage() {
  const [avulsaOpen, setAvulsaOpen] = useState(false);
  const [dividaOpen, setDividaOpen] = useState(false);
  const [dialogDefaultTab, setDialogDefaultTab] = useState<"avulsa" | "fixa" | "divida" | "pix">("avulsa");

  // Month navigation
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const { data: txData, isLoading: txLoading, payTransaction, softDeleteTransaction, updateTransaction } = useTransacoes({ month, year });
  const { data: contratos, isLoading: contratosLoading } = useContratosDivida();

  // Filters
  const { data: categorias } = useCategorias();
  const { data: subcategorias } = useSubcategorias();
  const { data: bancos } = useBancos();
  const { data: cartoes } = useCartoes();
  const [filterCategoria, setFilterCategoria] = useState<string>("__all");
  const [filterSubcategoria, setFilterSubcategoria] = useState<string>("__all");
  const [filterBanco, setFilterBanco] = useState<string>("__all");
  const [filterCartao, setFilterCartao] = useState<string>("__all");
  const [filterOrigem, setFilterOrigem] = useState<string>("__all");

  // Payment modals
  const [payVarTx, setPayVarTx] = useState<any>(null);
  const [payReceiptTx, setPayReceiptTx] = useState<any>(null);

  // Debt dialogs
  const [amortContrato, setAmortContrato] = useState<any>(null);
  const [parcelasContratoId, setParcelasContratoId] = useState<string | null>(null);
  const [parcelasContratoNome, setParcelasContratoNome] = useState("");

  const filteredSubcategorias = useMemo(() => {
    if (!subcategorias || filterCategoria === "__all") return [];
    return subcategorias.filter((s: any) => s.categoria_id === filterCategoria);
  }, [subcategorias, filterCategoria]);

  const filteredCartoes = useMemo(() => {
    if (!cartoes) return [];
    if (filterBanco === "__all") return cartoes;
    return cartoes.filter((c: any) => c.banco_id === filterBanco);
  }, [cartoes, filterBanco]);

  const applyFilters = (items: any[]) => {
    return items.filter(t => {
      if (filterCategoria !== "__all") {
        if (!t.categoria_id) return false;
        if (t.categoria_id !== filterCategoria) return false;
      }
      if (filterSubcategoria !== "__all" && t.subcategoria !== filterSubcategoria) return false;
      if (filterBanco !== "__all" && t.banco_id !== filterBanco) return false;
      if (filterCartao !== "__all" && t.cartao_id !== filterCartao) return false;
      if (filterOrigem !== "__all" && t.origem !== filterOrigem) return false;
      return true;
    });
  };

  const allTxs = applyFilters(txData?.currentMonth || []);
  const overdue = applyFilters(txData?.overdue || []);
  const fixasEVariaveis = allTxs.filter(t => t.categoria_tipo === "fixa" || t.categoria_tipo === "variavel");
  const avulsas = allTxs.filter(t => t.categoria_tipo === "avulsa");

  // Check comprovantes for all displayed transactions
  const allTxIds = useMemo(() => {
    const ids = [...allTxs, ...overdue].filter(t => t.status === "pago").map(t => t.id);
    return ids;
  }, [allTxs, overdue]);
  const { data: comprovantesSet } = useHasComprovante(allTxIds);

  const twoDaysMs = 2 * 86400000;
  const upcomingDue = allTxs.filter(t => {
    if (t.status !== "pendente") return false;
    const dueDate = new Date(t.data_vencimento + "T12:00:00");
    const diff = dueDate.getTime() - now.getTime();
    return diff > 0 && diff <= twoDaysMs;
  });

  const handlePayClick = (tx: any) => {
    if (tx.categoria_tipo === "variavel") {
      setPayVarTx(tx);
    } else {
      setPayReceiptTx(tx);
    }
  };

  const handlePayVariable = (txId: string, valor: number, dataPagamento: string) => {
    updateTransaction.mutate({ id: txId, valor, status: "pago" as any, data_pagamento: dataPagamento } as any);
  };

  const handlePayWithReceipt = (txId: string, _file?: File) => {
    payTransaction.mutate(txId);
  };

  const openDialog = (tab: "avulsa" | "fixa" | "divida" | "pix") => {
    setDialogDefaultTab(tab);
    setAvulsaOpen(true);
  };

  const clearFilters = () => {
    setFilterCategoria("__all");
    setFilterSubcategoria("__all");
    setFilterBanco("__all");
    setFilterCartao("__all");
    setFilterOrigem("__all");
  };

  // Contratos split
  const contratosAtivos = (contratos || []).filter((c: any) => c.status !== "quitado");
  const contratosQuitados = (contratos || []).filter((c: any) => c.status === "quitado");

  const renderTxList = (items: any[], emptyIcon: any, emptyMsg: string) => {
    if (txLoading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;
    if (!items.length) {
      return (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            {emptyIcon}
            <p className="text-muted-foreground text-sm">{emptyMsg}</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="grid gap-3">
        {items.map((tx: any) => {
          const isPaidNoReceipt = tx.status === "pago" && comprovantesSet && !comprovantesSet.has(tx.id);
          return (
            <Card key={tx.id} className="glass-card">
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{tx.descricao}</p>
                      {tx.categoria_tipo === "divida" && tx.parcela_atual && tx.parcela_total ? (
                        <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                          <CreditCard className="w-3 h-3" /> {tx.parcela_atual}/{tx.parcela_total}
                        </Badge>
                      ) : tx.categoria_tipo === "variavel" ? (
                        <Badge variant="outline" className="text-[10px] gap-1 border-violet-400/40 text-violet-500">
                          <TrendingUp className="w-3 h-3" /> Variável
                        </Badge>
                      ) : tx.categoria_tipo === "fixa" ? (
                        <Badge variant="outline" className="text-[10px] gap-1 border-sky-400/40 text-sky-500">
                          <CalendarClock className="w-3 h-3" /> Fixa
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1 border-accent-foreground/30 text-accent-foreground">
                          <Zap className="w-3 h-3" /> Avulsa
                        </Badge>
                      )}
                    </div>
                    {/* Debt progress bar */}
                    {tx.parcela_atual && tx.parcela_total && (
                      <div className="mt-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                          <span>{tx.parcela_atual}/{tx.parcela_total} parcelas</span>
                          <span>{Math.round((tx.parcela_atual / tx.parcela_total) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${(tx.parcela_atual / tx.parcela_total) * 100}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {isPaidNoReceipt ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 gap-1">
                              <AlertTriangle className="w-3 h-3" /> Pago s/ comprovante
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Pagamento sem comprovante anexado</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Badge variant="secondary" className={`text-[10px] ${
                          tx.status === "pago" ? "bg-status-paid/10 text-status-paid" :
                          tx.status === "atrasado" ? "bg-status-late/10 text-status-late" :
                          "bg-status-pending/10 text-status-pending"
                        }`}>
                          {tx.status === "pago" ? "Pago" : tx.status === "atrasado" ? "Atrasado" : "Pendente"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {formatTxTags(tx)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {tx.categoria_tipo === 'variavel' && tx.status === 'pendente' && Number(tx.valor) === 0 ? (
                      <Input
                        type="number"
                        placeholder="Valor?"
                        className="h-7 w-24 text-sm"
                        onBlur={(e) => {
                          const val = Number(e.target.value);
                          if (val > 0) updateTransaction.mutate({ id: tx.id, valor: val });
                        }}
                      />
                    ) : (
                      <p className="text-sm font-medium tabular-nums mr-1">R$ {Number(tx.valor).toFixed(2)}</p>
                    )}
                    {tx.status !== "pago" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                        onClick={() => handlePayClick(tx)} disabled={payTransaction.isPending}>
                        <Check className="w-3 h-3" /> Pagar
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => softDeleteTransaction.mutate(tx.id)} disabled={softDeleteTransaction.isPending}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <AttachSection transacaoId={tx.id} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 70) return "bg-green-500";
    if (pct >= 40) return "bg-amber-500";
    return "bg-blue-500";
  };

  const renderContratoCard = (c: any) => {
    const pct = c.percentual_pago ? Math.round(Number(c.percentual_pago)) : 0;
    const saldo = Number(c.saldo_devedor_estimado || 0);
    const parcRestantes = Number(c.parcelas_restantes || 0);
    const parcPagas = Number(c.parcelas_pagas || 0);
    const totalParc = Number(c.total_parcelas || 0);
    const valorParcela = Number(c.valor_parcela || 0);

    return (
      <Card key={c.id} className="glass-card">
        <CardContent className="py-4 px-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                <p className="font-medium text-sm">{c.descricao}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {c.credor || (c.bancos as any)?.nome || (c.cartoes as any)?.apelido || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                R$ {valorParcela.toFixed(2)}/mês × {totalParc} parcelas
              </p>
            </div>
            {c.status === "quitado" && (
              <Badge className="bg-green-500/10 text-green-600 border-0 text-[10px]">✅ Quitada</Badge>
            )}
          </div>

          {/* Progress bar */}
          <div className="mb-2">
            <div className="h-2.5 bg-accent rounded-full overflow-hidden">
              <div className={`h-full transition-all rounded-full ${getProgressColor(pct)}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{parcPagas} pagas de {totalParc} • {parcRestantes} restantes</span>
              <span>{pct}%</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Saldo devedor: <span className="font-medium text-foreground">R$ {saldo.toFixed(2)}</span>
          </p>

          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
              setParcelasContratoId(c.id);
              setParcelasContratoNome(c.descricao || "");
            }}>
              Ver Parcelas
            </Button>
            {c.status !== "quitado" && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAmortContrato(c)}>
                Amortizar
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive ml-auto"
              onClick={() => softDeleteTransaction.mutate(c.id)} disabled={softDeleteTransaction.isPending}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
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
            <h1 className="text-2xl font-semibold tracking-tight">Cadastro de Contas</h1>
            <p className="text-muted-foreground text-sm mt-1">Gerencie contas fixas, avulsas e dívidas</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm font-medium min-w-[140px] text-center">{meses[month - 1]} {year}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Cascading Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filterCategoria} onValueChange={v => { setFilterCategoria(v); setFilterSubcategoria("__all"); }}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas categorias</SelectItem>
              {(categorias || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          {filteredSubcategorias.length > 0 && (
            <Select value={filterSubcategoria} onValueChange={setFilterSubcategoria}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Subcategoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas subcategorias</SelectItem>
                {filteredSubcategorias.map((s: any) => <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={filterBanco} onValueChange={v => { setFilterBanco(v); setFilterCartao("__all"); }}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Banco" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos bancos</SelectItem>
              {(bancos || []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          {filteredCartoes.length > 0 && (
            <Select value={filterCartao} onValueChange={setFilterCartao}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Cartão" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos cartões</SelectItem>
                {filteredCartoes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.apelido} •{c.final_cartao}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={filterOrigem} onValueChange={setFilterOrigem}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Forma de pgto." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas formas</SelectItem>
              <SelectItem value="cartao">Cartão</SelectItem>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="dinheiro">Dinheiro</SelectItem>
              <SelectItem value="boleto">Boleto</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearFilters}>
            Limpar Filtros
          </Button>
        </div>

        {/* Alert Banners */}
        {(overdue.length > 0 || upcomingDue.length > 0) && (
          <div className="space-y-3">
            {overdue.length > 0 && (
              <Card className="border-status-late/30 bg-status-late/5">
                <CardContent className="py-3 px-5">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-status-late" />
                    <span className="text-sm font-semibold text-status-late">{overdue.length} conta(s) atrasada(s)</span>
                  </div>
                  <div className="space-y-1.5">
                    {overdue.slice(0, 5).map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{tx.descricao}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{new Date(tx.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                          <span className="font-medium">R$ {Number(tx.valor).toFixed(2)}</span>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-0.5"
                            onClick={() => handlePayClick(tx)} disabled={payTransaction.isPending}>
                            <Check className="w-3 h-3" /> Pagar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {upcomingDue.length > 0 && (
              <Card className="border-status-pending/30 bg-status-pending/5">
                <CardContent className="py-3 px-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-status-pending" />
                    <span className="text-sm font-semibold text-status-pending">{upcomingDue.length} conta(s) vencendo em 48h</span>
                  </div>
                  <div className="space-y-1.5">
                    {upcomingDue.slice(0, 5).map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{tx.descricao}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{new Date(tx.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                          <span className="font-medium">R$ {Number(tx.valor).toFixed(2)}</span>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] gap-0.5"
                            onClick={() => handlePayClick(tx)} disabled={payTransaction.isPending}>
                            <Check className="w-3 h-3" /> Pagar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Tabs defaultValue="fixas">
          <TabsList>
            <TabsTrigger value="fixas" className="gap-1.5"><CalendarClock className="w-4 h-4" /> Fixas</TabsTrigger>
            <TabsTrigger value="avulsas" className="gap-1.5"><Zap className="w-4 h-4" /> Avulsas</TabsTrigger>
            <TabsTrigger value="dividas" className="gap-1.5"><CreditCard className="w-4 h-4" /> Dívidas</TabsTrigger>
          </TabsList>

          <TabsContent value="fixas" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button onClick={() => openDialog('fixa')} className="gap-2"><Plus className="w-4 h-4" /> Nova Conta Fixa</Button>
            </div>
            {renderTxList(
              fixasEVariaveis,
              <CalendarClock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />,
              "Nenhuma conta fixa neste mês"
            )}
          </TabsContent>

          <TabsContent value="avulsas" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button onClick={() => openDialog('avulsa')} className="gap-2"><Plus className="w-4 h-4" /> Nova Conta Avulsa</Button>
            </div>
            {renderTxList(avulsas,
              <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />,
              "Nenhuma conta avulsa neste mês"
            )}
          </TabsContent>

          <TabsContent value="dividas" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button onClick={() => setDividaOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Nova Dívida</Button>
            </div>

            {contratosLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : !contratosAtivos.length && !contratosQuitados.length ? (
              <Card className="glass-card">
                <CardContent className="py-12 text-center">
                  <CreditCard className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhuma dívida cadastrada</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-3">
                  {contratosAtivos.map(renderContratoCard)}
                </div>

                {contratosQuitados.length > 0 && (
                  <details className="mt-4">
                    <summary className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer">
                      Dívidas quitadas ({contratosQuitados.length})
                    </summary>
                    <div className="grid gap-3 mt-3">
                      {contratosQuitados.map(renderContratoCard)}
                    </div>
                  </details>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateTransactionDialog open={avulsaOpen} onOpenChange={setAvulsaOpen} defaultTab={dialogDefaultTab} />
      <CreateDividaDialog open={dividaOpen} onOpenChange={setDividaOpen} />
      <PayVariableDialog
        open={!!payVarTx}
        onOpenChange={(o) => { if (!o) setPayVarTx(null); }}
        transaction={payVarTx}
        onConfirm={handlePayVariable}
        isPending={updateTransaction.isPending}
      />
      <PayWithReceiptDialog
        open={!!payReceiptTx}
        onOpenChange={(o) => { if (!o) setPayReceiptTx(null); }}
        transaction={payReceiptTx}
        onConfirm={handlePayWithReceipt}
        isPending={payTransaction.isPending}
      />
      <AmortizacaoDialog
        open={!!amortContrato}
        onOpenChange={(o) => { if (!o) setAmortContrato(null); }}
        contrato={amortContrato}
      />
      <ParcelasDialog
        contratoId={parcelasContratoId}
        contratoNome={parcelasContratoNome}
        open={!!parcelasContratoId}
        onOpenChange={(o) => { if (!o) setParcelasContratoId(null); }}
      />
    </DashboardLayout>
  );
}
