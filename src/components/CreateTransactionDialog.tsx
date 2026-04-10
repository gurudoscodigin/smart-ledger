import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
}

export function CreateTransactionDialog({ open, onOpenChange }: Props) {
  const { createTransaction, createInstallments, createPixPayment } = useTransacoes();
  const { data: cartoes } = useCartoes();
  const { data: bancos } = useBancos();
  const { data: categorias } = useCategorias();
  const [tab, setTab] = useState("avulsa");

  const [simple, setSimple] = useState({
    descricao: "", valor: "", data_vencimento: new Date().toISOString().split("T")[0],
    categoria_tipo: "avulsa" as any,
    origem: "",
    forma_pagamento: "",
    banco_id: "",
    cartao_id: "",
    categoria_id: "",
    subcategoria: "",
  });

  const [inst, setInst] = useState({ descricao: "", valorTotal: "", parcelas: "2", cartaoId: "", diaCobranca: "10" });
  const [pix, setPix] = useState({ descricao: "", valor: "", bancoId: "" });

  const { data: subcategorias } = useSubcategorias(simple.categoria_id || undefined);

  const needsBank = simple.forma_pagamento === "pix" || simple.forma_pagamento === "dinheiro";
  const needsCard = simple.forma_pagamento === "cartao";
  const simpleCanSubmit = !createTransaction.isPending
    && (!needsBank || simple.banco_id)
    && (!needsCard || simple.cartao_id);

  const setFormaPagamento = (v: string) => {
    setSimple(s => ({
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
      categoria_tipo: simple.categoria_tipo,
      banco_id: simple.banco_id || null,
      cartao_id: simple.cartao_id || null,
      categoria_id: simple.categoria_id || null,
      subcategoria: simple.subcategoria || null,
      origem: (simple.forma_pagamento as any) || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Transação</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="avulsa" className="flex-1">Avulsa</TabsTrigger>
            <TabsTrigger value="parcelamento" className="flex-1">Parcelamento</TabsTrigger>
            <TabsTrigger value="pix" className="flex-1">PIX Rápido</TabsTrigger>
          </TabsList>

          <TabsContent value="avulsa">
            <form onSubmit={handleSimple} className="space-y-3 pt-2">
              <div><Label>Descrição</Label><Input placeholder="Ex: Multa de trânsito" value={simple.descricao} onChange={e => setSimple(s => ({ ...s, descricao: e.target.value }))} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$)</Label><CurrencyInput value={simple.valor} onValueChange={v => setSimple(s => ({ ...s, valor: v }))} required /></div>
                <div><Label>Vencimento</Label><Input type="date" value={simple.data_vencimento} onChange={e => setSimple(s => ({ ...s, data_vencimento: e.target.value }))} required /></div>
              </div>
              <div><Label>Tipo</Label>
                <Select value={simple.categoria_tipo} onValueChange={v => setSimple(s => ({ ...s, categoria_tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avulsa">Avulsa</SelectItem>
                    <SelectItem value="fixa">Fixa</SelectItem>
                    <SelectItem value="variavel">Variável</SelectItem>
                  </SelectContent>
                </Select>
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

              <div><Label>Origem da conta</Label>
                <Select value={simple.origem} onValueChange={v => setSimple(s => ({ ...s, origem: v }))}>
                  <SelectTrigger><SelectValue placeholder="De onde veio essa conta?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="site">Site / App</SelectItem>
                    <SelectItem value="boleto_correio">Boleto (correio)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">Onde você recebeu ou consultou essa conta</p>
              </div>

              <div><Label>Forma de pagamento</Label>
                <Select value={simple.forma_pagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger><SelectValue placeholder="Como vai pagar?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {needsBank && (
                <div>
                  <Label className="flex items-center gap-1">Banco de origem <span className="text-destructive">*</span></Label>
                  <Select value={simple.banco_id} onValueChange={v => setSimple(s => ({ ...s, banco_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="De qual banco saiu?" /></SelectTrigger>
                    <SelectContent>
                      {(bancos || []).map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {needsCard && (
                <div>
                  <Label className="flex items-center gap-1">Cartão <span className="text-destructive">*</span></Label>
                  <Select value={simple.cartao_id} onValueChange={v => setSimple(s => ({ ...s, cartao_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Qual cartão?" /></SelectTrigger>
                    <SelectContent>
                      {(cartoes || []).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.apelido} (•••• {c.final_cartao})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {simple.forma_pagamento === "debito_automatico" && (
                <div>
                  <Label>Banco do débito automático</Label>
                  <Select value={simple.banco_id} onValueChange={v => setSimple(s => ({ ...s, banco_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Qual banco?" /></SelectTrigger>
                    <SelectContent>
                      {(bancos || []).map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={!simpleCanSubmit}>Registrar</Button>
            </form>
          </TabsContent>

          <TabsContent value="parcelamento">
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
              <Button type="submit" className="w-full" disabled={createInstallments.isPending}>Registrar Parcelamento</Button>
            </form>
          </TabsContent>

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
