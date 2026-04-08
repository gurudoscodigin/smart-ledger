import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCartoes } from "@/hooks/useCartoes";
import { useBancos } from "@/hooks/useBancos";

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
    limite_total: 0,
    dia_fechamento: 25,
    dia_vencimento: 5,
    banco_id: "",
    data_validade: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      ...form,
      limite_disponivel: form.limite_total,
      banco_id: form.banco_id,
      data_validade: form.data_validade || null,
    });
    onOpenChange(false);
    setForm({ apelido: "", final_cartao: "", bandeira: "" as any, tipo_funcao: "" as any, formato: "fisico" as any, limite_total: 0, dia_fechamento: 25, dia_vencimento: 5, banco_id: "", data_validade: "" });
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
              <Input type="number" min={0} step={0.01} value={form.limite_total || ""} onChange={e => setForm(f => ({ ...f, limite_total: Number(e.target.value) }))} required />
            </div>
            <div>
              <Label>Dia Fechamento</Label>
              <Input type="number" min={1} max={31} value={form.dia_fechamento} onChange={e => setForm(f => ({ ...f, dia_fechamento: Number(e.target.value) }))} required />
            </div>
            <div>
              <Label>Dia Vencimento</Label>
              <Input type="number" min={1} max={31} value={form.dia_vencimento} onChange={e => setForm(f => ({ ...f, dia_vencimento: Number(e.target.value) }))} required />
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
              <Label>Validade</Label>
              <Input type="date" value={form.data_validade} onChange={e => setForm(f => ({ ...f, data_validade: e.target.value }))} />
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
