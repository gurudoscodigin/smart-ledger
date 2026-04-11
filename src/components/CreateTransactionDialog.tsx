import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useTransacoes } from "@/hooks/useTransacoes";
import { useCartoes } from "@/hooks/useCartoes";
import { useBancos } from "@/hooks/useBancos";
import { useCategorias } from "@/hooks/useCategorias";
import { CurrencyInput } from "@/components/CurrencyInput";
import { NumericInput } from "@/components/NumericInput";
import { useSubcategorias } from "@/hooks/useSubcategorias";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "avulsa" | "fixa" | "divida" | "pix";
}

export function CreateTransactionDialog({ open, onOpenChange, defaultTab }: Props) {
  const { createTransaction, createInstallments, createPixPayment } = useTransacoes();
  const { data: cartoes } = useCartoes();
  const { data: bancos } = useBancos();
  const { data: categorias } = useCategorias();
  const [tab, setTab] = useState(defaultTab || "avulsa");

  useEffect(() => {
    if (defaultTab) setTab(defaultTab);
  }, [defaultTab]);

  const [simple, setSimple] = useState({
    descricao: "", valor: "", data_vencimento: new Date().toISOString().split("T")[0],
    origem: "",
    forma_pagamento: "",
    banco_id: "",
    cartao_id: "",
    categoria_id: "",
    subcategoria: "",
  });

  // Fixed tab state
  const [fixed, setFixed] = useState({
    descricao: "", valor: "", data_vencimento: new Date().toISOString().split("T")[0],
    ehVariavel: false,
    forma_pagamento: "",
    banco_id: "",
    cartao_id: "",
    categoria_id: "",
    subcategoria: "",
  });

  const [inst, setInst] = useState({ descricao: "", valorTotal: "", parcelas: "2", cartaoId: "", diaCobranca: "10" });
  const [pix, setPix] = useState({ descricao: "", valor: "", bancoId: "" });

  const { data: subcategorias } = useSubcategorias(simple.categoria_id || undefined);
  const { data: fixedSubcategorias } = useSubcategorias(fixed.categoria_id || undefined);

  const needsBank = simple.forma_pagamento === "pix" || simple.forma_pagamento === "dinheiro";
  const needsCard = simple.forma_pagamento === "cartao";
  const simpleCanSubmit = !createTransaction.isPending
    && (!needsBank || simple.banco_id)
    && (!needsCard || simple.cartao_id);

  const fixedNeedsBank = fixed.forma_pagamento === "pix" || fixed.forma_pagamento === "dinheiro";
  const fixedNeedsCard = fixed.forma_pagamento === "cartao";
  const fixedCanSubmit = !createTransaction.isPending
    && (!fixedNeedsBank || fixed.banco_id)
    && (!fixedNeedsCard || fixed.cartao_id);

  const setFormaPagamento = (v: string) => {
    setSimple(s => ({
      ...s,
      forma_pagamento: v,
      cartao_id: v === "cartao" ? s.cartao_id : "",
      banco_id: v === "cartao" ? "" : s.banco_id,
    }));
  };

  const setFixedFormaPagamento = (v: string) => {
    setFixed(s => ({
      ...s,
      forma_pagamento: v,
      cartao_id: v === "cartao" ? s.cartao_id : "",
      banco_id: v === "cartao" ? "" : s.banco_id,
    }));
  };

  const handleSimple = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTransaction.mutateAsync({
      descricao: simple.descricao,
      valor: Number(simple.valor),
      data_vencimento: simple.data_vencimento || new Date().toISOString().split("T")[0],
      categoria_tipo: "avulsa",
      banco_id: simple.banco_id || null,
      cartao_id: simple.cartao_id || null,
      categoria_id: simple.categoria_id || null,
      subcategoria: simple.subcategoria || null,
      origem: (simple.forma_pagamento as any) || null,
      status: "pendente",
    });
    onOpenChange(false);
  };

  const handleFixed = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTransaction.mutateAsync({
      descricao: fixed.descricao,
      valor: fixed.ehVariavel ? 0 : Number(fixed.valor),
      data_vencimento: fixed.data_vencimento || new Date().toISOString().split("T")[0],
      categoria_tipo: fixed.ehVariavel ? "variavel" : "fixa",
      banco_id: fixed.banco_id || null,
      cartao_id: fixed.cartao_id || null,
      categoria_id: fixed.categoria_id || null,
      subcategoria: fixed.subcategoria || null,
      origem: (fixed.forma_pagamento as any) || null,
      status: "pendente",
    });
    onOpenChange(false);
  };

  const handleInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    await createInstallments.mutateAsync({
      descricao: inst.descricao,
      valorTotal: Number(inst.valorTotal),
      parcelas: Number(inst.parcelas),
      cartaoId: inst.cartaoId,
      categoriaTipo: "divida",
      diaCobranca: Number(inst.diaCobranca),
    });
    onOpenChange(false);
  };

  const handlePix = async (e: React.FormEvent) => {
    e.preventDefault();
    await createPixPayment.mutateAsync({
      descricao: pix.descricao,
      valor: Number(pix.valor),
      bancoId: pix.bancoId,
    });
    onOpenChange(false);
  };

  const renderPaymentFields = (
    state: typeof simple,
    setState: React.Dispatch<React.SetStateAction<typeof simple>>,
    setForma: (v: string) => void,
    nBank: boolean,
    nCard: boolean
  ) => (
    <>
      <div><Label>Forma de pagamento</Label>
        <Select value={state.forma_pagamento} onValueChange={setForma}>
          <SelectTrigger><SelectValue placeholder="Como vai pagar?" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pix">PIX</SelectItem>
            <SelectItem value="cartao">Cartão</SelectItem>
            <SelectItem value="boleto">Boleto</SelectItem>
            <SelectItem value="dinheiro">Dinheiro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {nBank && (
        <div>
          <Label className="flex items-center gap-1">Banco de origem <span className="text-destructive">*</span></Label>
          <Select value={state.banco_id} onValueChange={v => setState(s => ({ ...s, banco_id: v }))}>
            <SelectTrigger><SelectValue placeholder="De qual banco saiu?" /></SelectTrigger>
            <SelectContent>
              {(bancos || []).map(b => (
                <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {nCard && (
        <div>
          <Label className="flex items-center gap-1">Cartão <span className="text-destructive">*</span></Label>
          <Select value={state.cartao_id} onValueChange={v => setState(s => ({ ...s, cartao_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Qual cartão?" /></SelectTrigger>
            <SelectContent>
              {(cartoes || []).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.apelido} (•••• {c.final_cartao})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Transação</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full" >
            <TabsTrigger value="avulsa" className="flex-1">Avulsa</TabsTrigger>
            <TabsTrigger value="fixa" className="flex-1">Fixa</TabsTrigger>
            <TabsTrigger value="divida" className="flex-1">Dívida</TabsTrigger>
            <TabsTrigger value="pix" className="flex-1">PIX Rápido</TabsTrigger>
          </TabsList>

          {/* Tab Avulsa */}
          <TabsContent value="avulsa">
            <form onSubmit={handleSimple} className="space-y-3 pt-2">
              <div><Label>Descrição</Label><Input placeholder="Ex: Multa de trânsito" value={simple.descricao} onChange={e => setSimple(s => ({ ...s, descricao: e.target.value }))} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$)</Label><CurrencyInput value={simple.valor} onValueChange={v => setSimple(s => ({ ...s, valor: v }))} required /></div>
                <div><Label>Vencimento</Label><Input type="date" value={simple.data_vencimento} onChange={e => setSimple(s => ({ ...s, data_vencimento: e.target.value }))} required /></div>
              </div>

              <div><Label>Categoria</Label>
                <Select value={simple.categoria_id} onValueChange={v => setSimple(s => ({ ...s, categoria_id: v, subcategoria: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    {(categorias || []).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(subcategorias || []).length > 0 && (
                <div><Label>Subcategoria</Label>
                  <Select value={simple.subcategoria} onValueChange={v => setSimple(s => ({ ...s, subcategoria: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a subcategoria" /></SelectTrigger>
                    <SelectContent>
                      {(subcategorias || []).map((s: any) => (
                        <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {renderPaymentFields(simple, setSimple, setFormaPagamento, needsBank, needsCard)}

              <Button type="submit" className="w-full" disabled={!simpleCanSubmit}>Registrar</Button>
            </form>
          </TabsContent>

          {/* Tab Fixa */}
          <TabsContent value="fixa">
            <form onSubmit={handleFixed} className="space-y-3 pt-2">
              <div><Label>Descrição</Label><Input placeholder="Ex: Aluguel" value={fixed.descricao} onChange={e => setFixed(s => ({ ...s, descricao: e.target.value }))} required /></div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <Label className="text-sm">Valor variável mês a mês?</Label>
                <Switch checked={fixed.ehVariavel} onCheckedChange={v => setFixed(s => ({ ...s, ehVariavel: v }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor (R$)</Label>
                  <CurrencyInput
                    value={fixed.valor}
                    onValueChange={v => setFixed(s => ({ ...s, valor: v }))}
                    required={!fixed.ehVariavel}
                    placeholder={fixed.ehVariavel ? "Será preenchido no mês" : undefined}
                  />
                </div>
                <div><Label>Vencimento</Label><Input type="date" value={fixed.data_vencimento} onChange={e => setFixed(s => ({ ...s, data_vencimento: e.target.value }))} required /></div>
              </div>

              <div><Label>Categoria</Label>
                <Select value={fixed.categoria_id} onValueChange={v => setFixed(s => ({ ...s, categoria_id: v, subcategoria: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    {(categorias || []).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(fixedSubcategorias || []).length > 0 && (
                <div><Label>Subcategoria</Label>
                  <Select value={fixed.subcategoria} onValueChange={v => setFixed(s => ({ ...s, subcategoria: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a subcategoria" /></SelectTrigger>
                    <SelectContent>
                      {(fixedSubcategorias || []).map((s: any) => (
                        <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {renderPaymentFields(
                fixed as any, setFixed as any, setFixedFormaPagamento, fixedNeedsBank, fixedNeedsCard
              )}

              <Button type="submit" className="w-full" disabled={!fixedCanSubmit}>Registrar</Button>
            </form>
          </TabsContent>

          {/* Tab Dívida */}
          <TabsContent value="divida">
            <form onSubmit={handleInstallment} className="space-y-3 pt-2">
              <div><Label>Descrição</Label><Input placeholder="Ex: iPhone 16" value={inst.descricao} onChange={e => setInst(s => ({ ...s, descricao: e.target.value }))} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor Total (R$)</Label><CurrencyInput value={inst.valorTotal} onValueChange={v => setInst(s => ({ ...s, valorTotal: v }))} required /></div>
                <div><Label>Parcelas</Label><NumericInput value={inst.parcelas} onValueChange={v => setInst(s => ({ ...s, parcelas: v }))} placeholder="2" required /></div>
              </div>
              <div><Label>Cartão</Label>
                <Select value={inst.cartaoId} onValueChange={v => setInst(s => ({ ...s, cartaoId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                  <SelectContent>
                    {(cartoes || []).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.apelido} (•••• {c.final_cartao})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Dia da cobrança</Label><NumericInput value={inst.diaCobranca} onValueChange={v => setInst(s => ({ ...s, diaCobranca: v }))} placeholder="10" /></div>
              <Button type="submit" className="w-full" disabled={createInstallments.isPending}>Registrar Dívida</Button>
            </form>
          </TabsContent>

          {/* Tab PIX */}
          <TabsContent value="pix">
            <form onSubmit={handlePix} className="space-y-3 pt-2">
              <div><Label>Descrição</Label><Input placeholder="Ex: Multa R$ 130" value={pix.descricao} onChange={e => setPix(s => ({ ...s, descricao: e.target.value }))} required /></div>
              <div><Label>Valor (R$)</Label><CurrencyInput value={pix.valor} onValueChange={v => setPix(s => ({ ...s, valor: v }))} required /></div>
              <div><Label>Banco de Origem</Label>
                <Select value={pix.bancoId} onValueChange={v => setPix(s => ({ ...s, bancoId: v }))}>
                  <SelectTrigger><SelectValue placeholder="De qual banco saiu?" /></SelectTrigger>
                  <SelectContent>
                    {(bancos || []).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createPixPayment.isPending}>Registrar PIX</Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
