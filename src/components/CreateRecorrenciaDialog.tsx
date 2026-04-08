import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecorrencias } from "@/hooks/useRecorrencias";
import { useCartoes } from "@/hooks/useCartoes";
import { useBancos } from "@/hooks/useBancos";
import { useCategorias } from "@/hooks/useCategorias";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIAS_PADRAO = [
  { label: "Software", value: "software" },
  { label: "Contas do Escritório", value: "contas_escritorio" },
  { label: "Prestação de Serviços", value: "prestacao_servicos" },
  { label: "Colaboradores", value: "colaboradores" },
  { label: "Marketing", value: "marketing" },
];

export function CreateRecorrenciaDialog({ open, onOpenChange }: Props) {
  const { create } = useRecorrencias();
  const { data: cartoes } = useCartoes();
  const { data: bancos } = useBancos();
  const { data: categorias } = useCategorias();

  const [form, setForm] = useState({
    nome: "",
    valor_estimado: 0,
    eh_variavel: false,
    dia_vencimento_padrao: 10,
    origem: "",        // onde a conta chega: email, site, boleto, app
    forma_pagamento: "", // como paga: pix, cartao, debito_automatico, boleto, dinheiro
    cartao_id: "",
    banco_id: "",
    categoria_id: "",
    url_site_login: "",
  });

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  // Reset dependent fields when forma_pagamento changes
  const setFormaPagamento = (v: string) => {
    setForm(f => ({
      ...f,
      forma_pagamento: v,
      // Clear card if not paying by card
      cartao_id: v === "cartao" ? f.cartao_id : "",
      // Clear bank if paying by card (card already has a bank)
      banco_id: v === "cartao" ? "" : f.banco_id,
    }));
  };

  const needsBank = form.forma_pagamento === "pix" || form.forma_pagamento === "dinheiro";
  const needsCard = form.forma_pagamento === "cartao";
  const canSubmit = !create.isPending
    && (!needsBank || form.banco_id)
    && (!needsCard || form.cartao_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      nome: form.nome,
      valor_estimado: form.valor_estimado,
      eh_variavel: form.eh_variavel,
      dia_vencimento_padrao: form.dia_vencimento_padrao,
      cartao_id: form.cartao_id || undefined,
      banco_id: form.banco_id || undefined,
      origem: (form.origem as any) || undefined,
      categoria_id: form.categoria_id || undefined,
      url_site_login: form.url_site_login || undefined,
    });
    setForm({ nome: "", valor_estimado: 0, eh_variavel: false, dia_vencimento_padrao: 10, origem: "", forma_pagamento: "", cartao_id: "", banco_id: "", categoria_id: "", url_site_login: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Conta Fixa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <Label>Nome</Label>
            <Input placeholder="Ex: Conta de Luz, Netflix" value={form.nome} onChange={e => set("nome", e.target.value)} required />
          </div>

          <div className="flex items-center justify-between py-1">
            <Label className="cursor-pointer">Valor variável?</Label>
            <Switch checked={form.eh_variavel} onCheckedChange={v => set("eh_variavel", v)} />
          </div>
          <p className="text-[10px] text-muted-foreground -mt-2">
            {form.eh_variavel
              ? "O bot perguntará o valor real próximo ao vencimento"
              : "O valor será lançado automaticamente todo mês"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor Estimado (R$)</Label>
              <Input type="number" min={0} step={0.01} value={form.valor_estimado || ""} onChange={e => set("valor_estimado", Number(e.target.value))} required />
            </div>
            <div>
              <Label>Dia do Vencimento</Label>
              <Input type="number" min={1} max={31} value={form.dia_vencimento_padrao} onChange={e => set("dia_vencimento_padrao", Number(e.target.value))} required />
            </div>
          </div>

          <div>
            <Label>Origem da conta</Label>
            <Select value={form.origem} onValueChange={v => set("origem", v)}>
              <SelectTrigger><SelectValue placeholder="De onde vem essa conta?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="site">Site / App</SelectItem>
                <SelectItem value="boleto">Boleto (correio)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">Onde você recebe ou consulta essa conta</p>
          </div>

          <div>
            <Label>Forma de pagamento</Label>
            <Select value={form.forma_pagamento} onValueChange={setFormaPagamento}>
              <SelectTrigger><SelectValue placeholder="Como você paga?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* PIX / Dinheiro → Bank required */}
          {needsBank && (
            <div>
              <Label className="flex items-center gap-1">
                Banco de origem <span className="text-destructive">*</span>
              </Label>
              <Select value={form.banco_id} onValueChange={v => set("banco_id", v)}>
                <SelectTrigger><SelectValue placeholder="De qual banco sai?" /></SelectTrigger>
                <SelectContent>
                  {(bancos || []).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Obrigatório para manter o saldo sincronizado</p>
            </div>
          )}

          {/* Cartão → Card selector */}
          {needsCard && (
            <div>
              <Label className="flex items-center gap-1">
                Cartão <span className="text-destructive">*</span>
              </Label>
              <Select value={form.cartao_id} onValueChange={v => set("cartao_id", v)}>
                <SelectTrigger><SelectValue placeholder="Qual cartão?" /></SelectTrigger>
                <SelectContent>
                  {(cartoes || []).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.apelido} (•••• {c.final_cartao})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">O banco já está vinculado ao cartão</p>
            </div>
          )}

          {/* Débito automático → Bank */}
          {form.forma_pagamento === "debito_automatico" && (
            <div>
              <Label>Banco do débito automático</Label>
              <Select value={form.banco_id} onValueChange={v => set("banco_id", v)}>
                <SelectTrigger><SelectValue placeholder="Qual banco?" /></SelectTrigger>
                <SelectContent>
                  {(bancos || []).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Categoria</Label>
            <Select value={form.categoria_id} onValueChange={v => set("categoria_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(categorias || []).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
                {CATEGORIAS_PADRAO.map(c => (
                  <SelectItem key={c.value} value={c.value} disabled>{c.label} (criar primeiro)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>URL / Site de Login (opcional)</Label>
            <Input placeholder="https://..." value={form.url_site_login} onChange={e => set("url_site_login", e.target.value)} />
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {create.isPending ? "Salvando..." : "Cadastrar Conta Fixa"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
