import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, Check, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const PAID_VALUES = ["pago", "paga", "paid", "sim", "yes", "1", "true", "x", "✓"];

const SYSTEM_FIELDS = [
  { key: "descricao", label: "Descrição" },
  { key: "valor", label: "Valor" },
  { key: "data_vencimento", label: "Data de Vencimento" },
  { key: "data_pagamento", label: "Data de Pagamento" },
  { key: "status", label: "Status" },
  { key: "categoria_tipo", label: "Tipo (fixa/avulsa/variavel/divida)" },
  { key: "origem", label: "Origem" },
  { key: "__skip", label: "— Ignorar coluna —" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportSpreadsheetDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<"upload" | "mapping" | "validation" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter(l => l.trim());
    const h = lines[0].split(",").map(s => s.trim().replace(/"/g, ""));
    const r = lines.slice(1).map(l => l.split(",").map(s => s.trim().replace(/"/g, "")));
    return { headers: h, rows: r };
  };

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);
      setHeaders(h);
      setRows(r);
      // Auto-map if names match
      const autoMap: Record<string, string> = {};
      h.forEach(col => {
        const lower = col.toLowerCase();
        if (lower.includes("descri") || lower.includes("nome")) autoMap[col] = "descricao";
        else if (lower.includes("valor") || lower.includes("preço") || lower.includes("preco")) autoMap[col] = "valor";
        else if (lower.includes("vencimento") || lower.includes("data")) autoMap[col] = "data_vencimento";
        else if (lower.includes("pagamento")) autoMap[col] = "data_pagamento";
        else if (lower.includes("status")) autoMap[col] = "status";
        else autoMap[col] = "__skip";
      });
      setMapping(autoMap);
      setStep("mapping");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const validate = () => {
    const errs: string[] = [];
    const descCol = Object.entries(mapping).find(([, v]) => v === "descricao")?.[0];
    const valCol = Object.entries(mapping).find(([, v]) => v === "valor")?.[0];

    if (!descCol) errs.push("Coluna 'Descrição' é obrigatória");
    if (!valCol) errs.push("Coluna 'Valor' é obrigatória");

    if (valCol) {
      const valIdx = headers.indexOf(valCol);
      rows.forEach((row, i) => {
        const v = row[valIdx];
        if (v && isNaN(Number(v.replace(",", ".")))) {
          errs.push(`Linha ${i + 2}: valor inválido "${v}"`);
        }
      });
    }

    setErrors(errs);
    setStep("validation");
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const transactions = rows.map(row => {
        const tx: any = { user_id: user!.id, importado_via_excel: true, categoria_tipo: "avulsa", status: "pendente" };
        Object.entries(mapping).forEach(([col, field]) => {
          if (field === "__skip") return;
          const idx = headers.indexOf(col);
          let val = row[idx]?.trim();
          if (!val) return;
          if (field === "valor") val = val.replace(",", ".");
          if (field === "status") {
            tx[field] = PAID_VALUES.includes(val.toLowerCase()) ? "pago" : "pendente";
            return;
          }
          tx[field] = field === "valor" ? Number(val) : val;
        });
        if (!tx.data_vencimento) tx.data_vencimento = new Date().toISOString().split("T")[0];
        return tx;
      }).filter(tx => tx.descricao && tx.valor);

      const { error } = await supabase.from("transacoes").insert(transactions);
      if (error) throw error;
      toast.success(`${transactions.length} transações importadas!`);
      setStep("done");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setErrors([]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Planilha</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".csv";
              input.onchange = (e: any) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
              input.click();
            }}
          >
            <Upload className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium">Arraste seu arquivo CSV aqui</p>
            <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Mapeie as colunas da sua planilha:</p>
            <div className="space-y-3 max-h-64 overflow-auto">
              {headers.map(col => (
                <div key={col} className="flex items-center gap-3">
                  <Badge variant="secondary" className="min-w-[100px] justify-center text-xs">{col}</Badge>
                  <span className="text-muted-foreground text-xs">→</span>
                  <Select value={mapping[col] || "__skip"} onValueChange={v => setMapping(m => ({ ...m, [col]: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SYSTEM_FIELDS.map(f => (
                        <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{rows.length} linhas encontradas</p>
            <Button onClick={validate} className="w-full">Validar Dados</Button>
          </div>
        )}

        {step === "validation" && (
          <div className="space-y-4">
            {errors.length > 0 ? (
              <>
                <div className="bg-status-late/5 border border-status-late/20 rounded-lg p-4 space-y-2">
                  {errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="w-4 h-4 text-status-late flex-shrink-0 mt-0.5" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" onClick={() => setStep("mapping")} className="w-full">Corrigir Mapeamento</Button>
              </>
            ) : (
              <>
                <div className="bg-status-paid/5 border border-status-paid/20 rounded-lg p-4 flex items-center gap-3">
                  <Check className="w-5 h-5 text-status-paid" />
                  <span className="text-sm font-medium">Tudo certo! {rows.length} linhas prontas para importar.</span>
                </div>
                <Button onClick={doImport} className="w-full" disabled={importing}>
                  {importing ? "Importando..." : `Importar ${rows.length} transações`}
                </Button>
              </>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-6">
            <FileSpreadsheet className="w-12 h-12 text-status-paid mx-auto mb-3" />
            <p className="font-medium">Importação concluída!</p>
            <p className="text-sm text-muted-foreground mt-1">Todos os registros foram marcados como importado_via_excel</p>
            <Button variant="outline" className="mt-4" onClick={() => { reset(); onOpenChange(false); }}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
