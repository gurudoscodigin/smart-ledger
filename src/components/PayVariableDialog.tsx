import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/CurrencyInput";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: { id: string; descricao: string; valor: number } | null;
  onConfirm: (txId: string, valor: number, dataPagamento: string) => void;
  isPending?: boolean;
}

export function PayVariableDialog({ open, onOpenChange, transaction, onConfirm, isPending }: Props) {
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && transaction) {
      setValor(String(transaction.valor));
      setData(new Date().toISOString().split("T")[0]);
    }
    onOpenChange(isOpen);
  };

  const handleConfirm = () => {
    if (!transaction) return;
    onConfirm(transaction.id, Number(valor) || 0, data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagar — {transaction?.descricao}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Valor a pagar (R$)</Label>
            <CurrencyInput value={valor} onValueChange={setValor} placeholder="0.00" />
          </div>
          <div>
            <Label>Data do pagamento</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isPending || !valor}>
            {isPending ? "Pagando..." : "Confirmar Pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
