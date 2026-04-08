import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/CurrencyInput";
import { useBancos } from "@/hooks/useBancos";
import { useCartoes } from "@/hooks/useCartoes";

interface EditCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: any;
}

export function EditCardDialog({ open, onOpenChange, card }: EditCardDialogProps) {
  const { data: bancos } = useBancos();
  const { update } = useCartoes();
  const [form, setForm] = useState({
    apelido: "",
    banco_id: "",
    limite_total: "",
    formato: "fisico" as "fisico" | "virtual",
  });

  useEffect(() => {
    if (card) {
      setForm({
        apelido: card.apelido || "",
        banco_id: card.banco_id || "__none",
        limite_total: String(card.limite_total || 0),
        formato: card.formato || "fisico",
      });
    }
  }, [card]);

  const handleSave = () => {
    if (!card) return;
    const limiteTotal = Number(form.limite_total) || 0;
    const oldLimiteTotal = Number(card.limite_total) || 0;
    const diff = limiteTotal - oldLimiteTotal;
    const newDisponivel = Math.max(0, Number(card.limite_disponivel) + diff);

    update.mutate({
      id: card.id,
      apelido: form.apelido,
      banco_id: form.banco_id === "__none" ? null : form.banco_id,
      limite_total: limiteTotal,
      limite_disponivel: newDisponivel,
      formato: form.formato,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Cartão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome do cartão</Label>
            <Input value={form.apelido} onChange={e => setForm(f => ({ ...f, apelido: e.target.value }))} />
          </div>
          <div>
            <Label>Banco vinculado</Label>
            <Select value={form.banco_id} onValueChange={v => setForm(f => ({ ...f, banco_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Nenhum</SelectItem>
                {(bancos || []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Limite total</Label>
            <CurrencyInput value={form.limite_total} onValueChange={v => setForm(f => ({ ...f, limite_total: v }))} />
          </div>
          <div>
            <Label>Formato</Label>
            <Select value={form.formato} onValueChange={v => setForm(f => ({ ...f, formato: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fisico">Físico</SelectItem>
                <SelectItem value="virtual">Virtual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={update.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
