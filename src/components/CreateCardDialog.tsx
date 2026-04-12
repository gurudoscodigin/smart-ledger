import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCartoes } from "@/hooks/useCartoes";
import { useBancos } from "@/hooks/useBancos";
import { CurrencyInput } from "@/components/CurrencyInput";
import { NumericInput } from "@/components/NumericInput";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCardDialog({ open, onOpenChange }: Props) {
  const { create } = useCartoes();
  const { data: bancos } = useBancos();
  const [form, setForm] = useState({
    apelido: "",
    final_cartao: "",
    bandeira: "" as any,
    tipo_funcao: "" as any,
    formato: "fisico" as any,
    limite_total: "",
    limite_credito_disponivel: "",
    dia_fechamento: "25",
    dia_vencimento: "5",
    banco_id: "",
    data_validade: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let dataValidade: string | null = null;
    if (form.data_validade && form.data_validade.length === 5) {
      const [mm, yy] = form.data_validade.split("/");
      dataValidade = `20${yy}-${mm}-01`;
    }
    const limiteTotal = Number(form.limite_total) || 0;
    await create.mutateAsync({
      ...form,
      limite_total: limiteTotal,
      dia_fechamento: Number(form.dia_fechamento),
      dia_vencimento: Number(form.dia_vencimento),
      limite_disponivel: limiteTotal,
      limite_credito_disponivel: form.tipo_funcao === "multiplo" ? (Number(form.limite_credito_disponivel) || 0) : 0,
      banco_id: form.banco_id,
      data_validade: dataValidade,
    });
    onOpenChange(false);
    setForm({ apelido: "", final_cartao: "", bandeira: "" as any, tipo_funcao: "" as any, formato: "fisico" as any, limite_total: "", limite_credito_disponivel: "", dia_fechamento: "25", dia_vencimento: "5", banco_id: "", data_validade: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Cartão</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Apelido</Label>
              <Input placeholder="Ex: Roxinho Softwares" value={form.apelido} onChange={e => setForm(f => ({ ...f, apelido: e.target.value }))} required />
            </div>
            <div>
              <Label>Final (4 dígitos)</Label>
              <Input placeholder="0781" maxLength={4} value={form.final_cartao} onChange={e => setForm(f => ({ ...f, final_cartao: e.target.value }))} required />
            </div>
            <div>
              <Label>Bandeira</Label>
              <Select value={form.bandeira} onValueChange={v => setForm(f => ({ ...f, bandeira: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa">Visa</SelectItem>
                  <SelectItem value="mastercard">Mastercard</SelectItem>
                  <SelectItem value="elo">Elo</SelectItem>
                  <SelectItem value="amex">Amex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo_funcao} onValueChange={v => setForm(f => ({ ...f, tipo_funcao: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="multiplo">Múltiplo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Formato</Label>
              <Select value={form.formato} onValueChange={v => setForm(f => ({ ...f, formato: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fisico">Físico</SelectItem>
                  <SelectItem value="virtual">Virtual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Limite Total (R$)</Label>
              <CurrencyInput value={form.limite_total} onValueChange={v => setForm(f => ({ ...f, limite_total: v }))} required />
            </div>

            {/* Bug 7: Show credit limit field for multiplo cards */}
            {form.tipo_funcao === "multiplo" && (
              <div className="col-span-2">
                <Label>Limite da função Crédito (R$)</Label>
                <CurrencyInput value={form.limite_credito_disponivel} onValueChange={v => setForm(f => ({ ...f, limite_credito_disponivel: v }))} placeholder="Limite exclusivo para crédito" />
              </div>
            )}

            <div>
              <Label>Dia Fechamento</Label>
              <NumericInput value={form.dia_fechamento} onValueChange={v => setForm(f => ({ ...f, dia_fechamento: v }))} placeholder="25" required />
            </div>
            <div>
              <Label>Dia Vencimento</Label>
              <NumericInput value={form.dia_vencimento} onValueChange={v => setForm(f => ({ ...f, dia_vencimento: v }))} placeholder="5" required />
            </div>
            <div>
              <Label>Banco *</Label>
              <Select value={form.banco_id} onValueChange={v => setForm(f => ({ ...f, banco_id: v }))} required>
                <SelectTrigger><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
                <SelectContent>
                  {(bancos || []).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!bancos?.length && (
                <p className="text-xs text-muted-foreground mt-1">Cadastre um banco primeiro na tela de cartões.</p>
              )}
            </div>
            <div>
              <Label>Validade (MM/AA)</Label>
              <Input
                placeholder="08/29"
                maxLength={5}
                value={form.data_validade}
                onChange={e => {
                  let v = e.target.value.replace(/[^\d]/g, "");
                  if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2, 4);
                  setForm(f => ({ ...f, data_validade: v }));
                }}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending || !form.banco_id}>
            {create.isPending ? "Criando..." : "Criar Cartão"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
