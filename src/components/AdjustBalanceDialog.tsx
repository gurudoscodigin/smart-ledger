import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/CurrencyInput";
import { useBancos } from "@/hooks/useBancos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banco: { id: string; nome: string; saldo_atual: number } | null;
}

export function AdjustBalanceDialog({ open, onOpenChange, banco }: Props) {
  const { updateSaldo } = useBancos();
  const [valor, setValor] = useState("");

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && banco) {
      setValor(String(banco.saldo_atual));
    }
    onOpenChange(isOpen);
  };

  const handleSave = () => {
    if (!banco) return;
    updateSaldo.mutate({ id: banco.id, saldo_atual: Number(valor) || 0 });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustar Saldo — {banco?.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Saldo atual (R$)</Label>
            <CurrencyInput value={valor} onValueChange={setValor} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Este valor sobrescreve o saldo atual do banco. Use com cuidado.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={updateSaldo.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
