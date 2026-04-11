import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useContratosDivida } from "@/hooks/useContratosDivida";
import { useBancos } from "@/hooks/useBancos";
import { CurrencyInput } from "@/components/CurrencyInput";
import { NumericInput } from "@/components/NumericInput";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato: any | null;
}

export function AmortizacaoDialog({ open, onOpenChange, contrato }: Props) {
  const { registrarAmortizacao } = useContratosDivida();
  const { data: bancos } = useBancos();

  const [tipo, setTipo] = useState("parcela_extra");
  const [valor, setValor] = useState("");
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split("T")[0]);
  const [parcelasAntecipadas, setParcelasAntecipadas] = useState("1");
  const [efeito, setEfeito] = useState("reduz_prazo");
  const [bancoId, setBancoId] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Pre-fill valor based on type
  const valorParcela = Number(contrato?.valor_parcela || 0);

  const prefilledValor = useMemo(() => {
    if (tipo === "parcela_extra") return valorParcela.toString();
    if (tipo === "parcelas_antecipadas") return (valorParcela * Number(parcelasAntecipadas || 1)).toString();
    return "";
  }, [tipo, valorParcela, parcelasAntecipadas]);

  const effectiveValor = valor || prefilledValor;

  const canSubmit = Number(effectiveValor) > 0 && dataPagamento && !registrarAmortizacao.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contrato) return;
    await registrarAmortizacao.mutateAsync({
      contratoId: contrato.id,
      tipo,
      valor: Number(effectiveValor),
      dataPagamento,
      parcelasAntecipadas: tipo === "parcelas_antecipadas" ? Number(parcelasAntecipadas) : undefined,
      efeito: tipo === "parcelas_antecipadas" ? efeito : undefined,
      bancoId: bancoId || undefined,
      observacoes: observacoes || undefined,
    });
    onOpenChange(false);
  };

  if (!contrato) return null;

  const saldo = Number(contrato.saldo_devedor_estimado || 0);
  const restantes = Number(contrato.parcelas_restantes || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Amortização — {contrato.descricao}</DialogTitle>
        </DialogHeader>

        <div className="bg-accent/50 rounded-lg p-3 mb-2">
          <p className="text-sm">Saldo atual: <span className="font-semibold">R$ {saldo.toFixed(2)}</span></p>
          <p className="text-xs text-muted-foreground">{restantes} parcelas restantes</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <RadioGroup value={tipo} onValueChange={setTipo} className="space-y-2">
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="parcela_extra" id="extra" className="mt-1" />
              <div>
                <Label htmlFor="extra" className="text-sm font-medium">Parcela extra</Label>
                <p className="text-[10px] text-muted-foreground">Pagar 1 mês adicional</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="reducao_saldo" id="reducao" className="mt-1" />
              <div>
                <Label htmlFor="reducao" className="text-sm font-medium">Redução de saldo</Label>
                <p className="text-[10px] text-muted-foreground">Pagar valor livre para abater o saldo</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="parcelas_antecipadas" id="antecipacao" className="mt-1" />
              <div>
                <Label htmlFor="antecipacao" className="text-sm font-medium">Antecipação de parcelas</Label>
                <p className="text-[10px] text-muted-foreground">Quitar N parcelas futuras de uma só vez</p>
              </div>
            </div>
          </RadioGroup>

          {tipo === "parcelas_antecipadas" && (
            <div className="space-y-2">
              <Label>Quantas parcelas antecipar?</Label>
              <NumericInput value={parcelasAntecipadas} onValueChange={setParcelasAntecipadas} placeholder="1" />
              <p className="text-[10px] text-muted-foreground">As próximas {parcelasAntecipadas} parcelas serão marcadas como pagas</p>
            </div>
          )}

          <div>
            <Label>Valor (R$) *</Label>
            <CurrencyInput
              value={effectiveValor}
              onValueChange={setValor}
              required
            />
          </div>

          <div>
            <Label>Data do pagamento *</Label>
            <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} required />
          </div>

          {tipo === "parcelas_antecipadas" && (
            <RadioGroup value={efeito} onValueChange={setEfeito} className="space-y-1">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="reduz_prazo" id="prazo" />
                <Label htmlFor="prazo" className="text-sm">Reduz o prazo (mantém valor da parcela)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="reduz_parcela" id="parcela" />
                <Label htmlFor="parcela" className="text-sm">Reduz o valor da parcela (mantém o prazo)</Label>
              </div>
            </RadioGroup>
          )}

          <div>
            <Label>Banco de origem</Label>
            <Select value={bancoId} onValueChange={setBancoId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(bancos || []).map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Observações</Label>
            <Input placeholder="Notas opcionais" value={observacoes} onChange={e => setObservacoes(e.target.value)} />
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {registrarAmortizacao.isPending ? "Registrando..." : "Registrar Amortização"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
