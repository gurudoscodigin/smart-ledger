import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useContratosDivida } from "@/hooks/useContratosDivida";
import { useCartoes } from "@/hooks/useCartoes";
import { useBancos } from "@/hooks/useBancos";
import { useCategorias } from "@/hooks/useCategorias";
import { useSubcategorias } from "@/hooks/useSubcategorias";
import { CurrencyInput } from "@/components/CurrencyInput";
import { NumericInput } from "@/components/NumericInput";
import { addMonths, parseISO, format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDividaDialog({ open, onOpenChange }: Props) {
  const { criarContrato } = useContratosDivida();
  const { data: cartoes } = useCartoes();
  const { data: bancos } = useBancos();
  const { data: categorias } = useCategorias();

  const [modo, setModo] = useState<"nova" | "andamento">("nova");
  const [descricao, setDescricao] = useState("");
  const [credor, setCredor] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [valorParcela, setValorParcela] = useState("");
  const [totalParcelas, setTotalParcelas] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const [dataContrato, setDataContrato] = useState(new Date().toISOString().split("T")[0]);
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState(new Date().toISOString().split("T")[0]);
  const [parcelasPagas, setParcelasPagas] = useState("0");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [bancoId, setBancoId] = useState("");
  const [cartaoId, setCartaoId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const { data: subcategorias } = useSubcategorias(categoriaId || undefined);

  const needsBank = formaPagamento === "pix" || formaPagamento === "dinheiro" || formaPagamento === "boleto";
  const needsCard = formaPagamento === "cartao";

  // Preview calculations
  const preview = useMemo(() => {
    const parcTot = Number(totalParcelas) || 0;
    const valParc = Number(valorParcela) || 0;
    const valorEstimado = valParc * parcTot;

    let ultimaParcela = "";
    if (dataPrimeiraParcela && parcTot > 0) {
      try {
        const base = parseISO(dataPrimeiraParcela);
        const ultima = addMonths(base, parcTot - 1);
        ultimaParcela = format(ultima, "dd/MM/yyyy");
      } catch { /* ignore */ }
    }

    return { valorEstimado, ultimaParcela };
  }, [totalParcelas, valorParcela, dataPrimeiraParcela]);

  const canSubmit = descricao && Number(valorTotal) > 0 && Number(valorParcela) > 0
    && Number(totalParcelas) >= 1 && Number(diaVencimento) >= 1
    && dataContrato && dataPrimeiraParcela
    && (modo === "nova" || Number(parcelasPagas) < Number(totalParcelas))
    && (!needsBank || bancoId) && (!needsCard || cartaoId)
    && !criarContrato.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await criarContrato.mutateAsync({
      descricao,
      credor: credor || undefined,
      valorTotal: Number(valorTotal),
      valorParcela: Number(valorParcela),
      totalParcelas: Number(totalParcelas),
      parcelasPagas: modo === "nova" ? 0 : Number(parcelasPagas),
      dataContrato,
      dataPrimeiraParcela,
      diaVencimento: Number(diaVencimento),
      bancoId: bancoId || undefined,
      cartaoId: cartaoId || undefined,
      categoriaId: categoriaId || undefined,
      subcategoria: subcategoria || undefined,
      origem: formaPagamento || undefined,
      observacoes: observacoes || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Dívida</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Mode selection */}
          <RadioGroup value={modo} onValueChange={(v) => setModo(v as "nova" | "andamento")} className="flex gap-4">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="nova" id="nova" />
              <Label htmlFor="nova" className="text-sm">Dívida nova</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="andamento" id="andamento" />
              <Label htmlFor="andamento" className="text-sm">Já em andamento</Label>
            </div>
          </RadioGroup>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Descrição *</Label>
              <Input placeholder="Ex: Financiamento Carro" value={descricao} onChange={e => setDescricao(e.target.value)} required />
            </div>
            <div>
              <Label>Credor</Label>
              <Input placeholder="Banco/Pessoa" value={credor} onChange={e => setCredor(e.target.value)} />
            </div>
            <div>
              <Label>Dia de Vencimento *</Label>
              <NumericInput value={diaVencimento} onValueChange={setDiaVencimento} placeholder="10" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valor Total (R$) *</Label><CurrencyInput value={valorTotal} onValueChange={setValorTotal} required /></div>
            <div><Label>Valor da Parcela (R$) *</Label><CurrencyInput value={valorParcela} onValueChange={setValorParcela} required /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Total de Parcelas *</Label><NumericInput value={totalParcelas} onValueChange={setTotalParcelas} placeholder="12" required /></div>
            <div><Label>Data do Contrato *</Label><Input type="date" value={dataContrato} onChange={e => setDataContrato(e.target.value)} required /></div>
          </div>

          <div>
            <Label>Data da 1ª Parcela *</Label>
            <Input type="date" value={dataPrimeiraParcela} onChange={e => setDataPrimeiraParcela(e.target.value)} required />
          </div>

          {modo === "andamento" && (
            <div className="space-y-2">
              <Label>Parcelas já pagas *</Label>
              <NumericInput value={parcelasPagas} onValueChange={setParcelasPagas} placeholder="0" required />
              <p className="text-[10px] text-muted-foreground">O sistema marcará as primeiras {parcelasPagas || 0} parcelas como pagas</p>
            </div>
          )}

          {/* Preview */}
          {preview.valorEstimado > 0 && (
            <div className="bg-accent/50 rounded-lg p-3 space-y-1">
              {preview.ultimaParcela && (
                <p className="text-xs text-muted-foreground">Última parcela: <span className="font-medium text-foreground">{preview.ultimaParcela}</span></p>
              )}
              <p className="text-xs text-muted-foreground">Valor total estimado: <span className="font-medium text-foreground">R$ {preview.valorEstimado.toFixed(2)}</span></p>
            </div>
          )}

          {/* Payment */}
          <div><Label>Forma de pagamento</Label>
            <Select value={formaPagamento} onValueChange={setFormaPagamento}>
              <SelectTrigger><SelectValue placeholder="Como vai pagar?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsBank && (
            <div>
              <Label>Banco *</Label>
              <Select value={bancoId} onValueChange={setBancoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
                <SelectContent>
                  {(bancos || []).map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsCard && (
            <div>
              <Label>Cartão *</Label>
              <Select value={cartaoId} onValueChange={setCartaoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                <SelectContent>
                  {(cartoes || []).map(c => <SelectItem key={c.id} value={c.id}>{c.apelido} (•••• {c.final_cartao})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div><Label>Categoria</Label>
            <Select value={categoriaId} onValueChange={v => { setCategoriaId(v); setSubcategoria(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(categorias || []).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(subcategorias || []).length > 0 && (
            <div><Label>Subcategoria</Label>
              <Select value={subcategoria} onValueChange={setSubcategoria}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(subcategorias || []).map((s: any) => <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Observações</Label>
            <Input placeholder="Notas opcionais" value={observacoes} onChange={e => setObservacoes(e.target.value)} />
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {criarContrato.isPending ? "Cadastrando..." : "Cadastrar Dívida"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
