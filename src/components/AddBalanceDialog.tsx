import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/CurrencyInput";
import { useBancos } from "@/hooks/useBancos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banco: { id: string; nome: string; saldo_atual: number } | null;
}

export function AddBalanceDialog({ open, onOpenChange, banco }: Props) {
  const { addSaldo } = useBancos();
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setValor("");
      setDescricao("");
    }
    onOpenChange(isOpen);
  };

  const handleSave = () => {
    if (!banco) return;
    const v = Number(valor) || 0;
    if (v <= 0) return;
    addSaldo.mutate({ id: banco.id, valor: v });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar Saldo — {banco?.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Valor do aporte (R$)</Label>
            <CurrencyInput value={valor} onValueChange={setValor} placeholder="0.00" />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Transferência, Receita..." />
          </div>
          <p className="text-[10px] text-muted-foreground">
            O valor será somado ao saldo atual de R$ {banco ? Number(banco.saldo_atual).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "0,00"}.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={addSaldo.isPending || !valor || Number(valor) <= 0}>
            {addSaldo.isPending ? "Adicionando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
