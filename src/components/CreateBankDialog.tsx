import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBancos } from "@/hooks/useBancos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBankDialog({ open, onOpenChange }: Props) {
  const { create } = useBancos();
  const [form, setForm] = useState({ nome: "", saldo_atual: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync(form);
    onOpenChange(false);
    setForm({ nome: "", saldo_atual: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo Banco</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome do Banco</Label>
            <Input
              placeholder="Ex: Nubank, Conta Simples, Itaú"
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>Saldo Atual (R$)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={form.saldo_atual || ""}
              onChange={e => setForm(f => ({ ...f, saldo_atual: Number(e.target.value) }))}
              placeholder="0,00"
            />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? "Criando..." : "Cadastrar Banco"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
