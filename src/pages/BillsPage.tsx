import { useState, useRef, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CalendarClock, Zap, ToggleRight, Trash2, Paperclip, FileText, Image, CreditCard, Landmark, TrendingUp, AlertTriangle, Clock, Check, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { CreateRecorrenciaDialog } from "@/components/CreateRecorrenciaDialog";
import { CreateTransactionDialog } from "@/components/CreateTransactionDialog";
import { PayVariableDialog } from "@/components/PayVariableDialog";
import { useRecorrencias } from "@/hooks/useRecorrencias";
import { useTransacoes } from "@/hooks/useTransacoes";
import { useComprovantes } from "@/hooks/useComprovantes";
import { useCategorias } from "@/hooks/useCategorias";
import { useSubcategorias } from "@/hooks/useSubcategorias";
import { useBancos } from "@/hooks/useBancos";
import { useCartoes } from "@/hooks/useCartoes";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

export default function BillsPage() {
  const [recOpen, setRecOpen] = useState(false);
  const [avulsaOpen, setAvulsaOpen] = useState(false);

  // Month navigation
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const { data: recorrencias, isLoading: recLoading, remove } = useRecorrencias();
  const { data: txData, isLoading: txLoading, payTransaction, softDeleteTransaction, updateTransaction } = useTransacoes({ month, year });

  // Filters
  const { data: categorias } = useCategorias();
  const { data: subcategorias } = useSubcategorias();
  const { data: bancos } = useBancos();
  const { data: cartoes } = useCartoes();
  const [filterCategoria, setFilterCategoria] = useState<string>("__all");
  const [filterSubcategoria, setFilterSubcategoria] = useState<string>("__all");
  const [filterBanco, setFilterBanco] = useState<string>("__all");
  const [filterCartao, setFilterCartao] = useState<string>("__all");

  // Variable payment modal
  const [payVarTx, setPayVarTx] = useState<any>(null);

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
      if (filterCategoria !== "__all" && t.categoria_id !== filterCategoria) return false;
      if (filterSubcategoria !== "__all" && t.subcategoria !== filterSubcategoria) return false;
      if (filterBanco !== "__all" && t.banco_id !== filterBanco) return false;
      if (filterCartao !== "__all" && t.cartao_id !== filterCartao) return false;
      return true;
    });
  };

  const allTxs = applyFilters(txData?.currentMonth || []);
  const overdue = applyFilters(txData?.overdue || []);
  const avulsas = allTxs.filter(t => t.categoria_tipo === "avulsa");
  const variaveis = allTxs.filter(t => t.categoria_tipo === "variavel");
  const dividas = allTxs.filter(t => t.categoria_tipo === "divida");

  const recFixas = (recorrencias || []).filter((r: any) => !r.eh_variavel);
  const recVariaveis = (recorrencias || []).filter((r: any) => r.eh_variavel);

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
      payTransaction.mutate(tx.id);
    }
  };

  const handlePayVariable = (txId: string, valor: number, dataPagamento: string) => {
    updateTransaction.mutate({ id: txId, valor, status: "pago" as any, data_pagamento: dataPagamento } as any);
  };

  const renderRecList = (items: any[], emptyMsg: string) => {
    if (recLoading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;
    if (!items.length) {
      return (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <CalendarClock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{emptyMsg}</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="grid gap-3">
        {items.map((rec: any) => (
          <Card key={rec.id} className="glass-card">
            <CardContent className="py-4 px-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{rec.nome}</p>
                    {rec.eh_variavel ? (
                      <Badge variant="outline" className="text-[10px] gap-1 border-violet-400/40 text-violet-500">
                        <ToggleRight className="w-3 h-3" /> Variável
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 border-sky-400/40 text-sky-500">
                        <CalendarClock className="w-3 h-3" /> Fixa
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Vence dia {rec.dia_vencimento_padrao}</span>
                    {rec.cartoes && <span>• {rec.cartoes.apelido}</span>}
                    {rec.bancos && <span>• {rec.bancos.nome}</span>}
                    {rec.categorias && <span>• {rec.categorias.nome}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium tabular-nums mr-1">
                    {rec.eh_variavel ? "~" : ""}R$ {Number(rec.valor_estimado).toFixed(2)}
                  </p>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(rec.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

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
        {items.map((tx: any) => (
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
                    <Badge variant="secondary" className={`text-[10px] ${
                      tx.status === "pago" ? "bg-status-paid/10 text-status-paid" :
                      tx.status === "atrasado" ? "bg-status-late/10 text-status-late" :
                      "bg-status-pending/10 text-status-pending"
                    }`}>
                      {tx.status === "pago" ? "Pago" : tx.status === "atrasado" ? "Atrasado" : "Pendente"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {tx.data_vencimento && <span>{new Date(tx.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                    {tx.origem && <span>• {tx.origem}</span>}
                    {tx.bancos && <span className="flex items-center gap-0.5"><Landmark className="w-3 h-3" /> {tx.bancos.nome}</span>}
                    {tx.cartoes && <span className="flex items-center gap-0.5"><CreditCard className="w-3 h-3" /> {tx.cartoes.apelido}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium tabular-nums mr-1">R$ {Number(tx.valor).toFixed(2)}</p>
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
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cadastro de Contas</h1>
            <p className="text-muted-foreground text-sm mt-1">Gerencie contas fixas, variáveis e avulsas</p>
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
            <TabsTrigger value="variaveis" className="gap-1.5"><TrendingUp className="w-4 h-4" /> Variáveis</TabsTrigger>
            <TabsTrigger value="avulsas" className="gap-1.5"><Zap className="w-4 h-4" /> Avulsas</TabsTrigger>
          </TabsList>

          <TabsContent value="fixas" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button onClick={() => setRecOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Nova Conta Fixa</Button>
            </div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Modelos Recorrentes</h3>
            {renderRecList(recFixas, "Nenhuma conta fixa cadastrada")}

            {allTxs.filter(t => t.categoria_tipo === "fixa").length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-6">Lançamentos do Mês</h3>
                {renderTxList(
                  allTxs.filter(t => t.categoria_tipo === "fixa"),
                  <CalendarClock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />,
                  ""
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="variaveis" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button onClick={() => setRecOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Nova Conta Variável</Button>
            </div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Modelos Recorrentes</h3>
            {renderRecList(recVariaveis, "Nenhuma conta variável cadastrada")}

            {variaveis.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-6">Lançamentos do Mês</h3>
                {renderTxList(variaveis,
                  <TrendingUp className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />,
                  ""
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="avulsas" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button onClick={() => setAvulsaOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Nova Conta Avulsa</Button>
            </div>
            {renderTxList([...avulsas, ...dividas],
              <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />,
              "Nenhuma conta avulsa neste mês"
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateRecorrenciaDialog open={recOpen} onOpenChange={setRecOpen} />
      <CreateTransactionDialog open={avulsaOpen} onOpenChange={setAvulsaOpen} />
      <PayVariableDialog
        open={!!payVarTx}
        onOpenChange={(o) => { if (!o) setPayVarTx(null); }}
        transaction={payVarTx}
        onConfirm={handlePayVariable}
        isPending={updateTransaction.isPending}
      />
    </DashboardLayout>
  );
}
