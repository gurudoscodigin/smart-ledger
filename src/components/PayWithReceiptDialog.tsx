import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Paperclip, FileText, Image } from "lucide-react";
import { useComprovantes } from "@/hooks/useComprovantes";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: { id: string; descricao: string; valor: number } | null;
  onConfirm: (txId: string, file?: File) => void;
  isPending?: boolean;
}

export function PayWithReceiptDialog({ open, onOpenChange, transaction, onConfirm, isPending }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload } = useComprovantes(transaction?.id);
  const queryClient = useQueryClient();

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) setFile(null);
    onOpenChange(isOpen);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 5MB)"); return; }
    setFile(f);
  };

  const handleConfirm = async () => {
    if (!transaction || processing) return;
    setProcessing(true);
    try {
      // 1. Mark as paid
      await supabase
        .from('transacoes')
        .update({
          status: 'pago' as any,
          data_pagamento: new Date().toISOString().split('T')[0]
        })
        .eq('id', transaction.id);

      // 2. Upload receipt if present
      if (file) {
        await upload.mutateAsync({ transacaoId: transaction.id, file });
      }

      // 3. Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['comprovantes'] });
      queryClient.invalidateQueries({ queryKey: ['comprovantes-check'] });
      queryClient.invalidateQueries({ queryKey: ['cartoes'] });

      toast.success(file ? 'Pago e comprovante anexado!' : 'Pagamento registrado');
      handleOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar pagamento");
    } finally {
      setProcessing(false);
    }
  };

  const getFileIcon = () => {
    if (file?.type.startsWith("image/")) return <Image className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar Pagamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-accent/50 rounded-lg p-4">
            <p className="text-sm font-medium">{transaction?.descricao}</p>
            <p className="text-lg font-semibold mt-1">R$ {Number(transaction?.valor || 0).toFixed(2)}</p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Paperclip className="w-4 h-4" /> Comprovante de Pagamento
            </Label>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} />
            {file ? (
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-background">
                {getFileIcon()}
                <span className="text-sm flex-1 truncate">{file.name}</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                  Remover
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                <Paperclip className="w-4 h-4" /> Anexar Comprovante
              </Button>
            )}

            {!file && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Sem comprovante, o pagamento ficará marcado com alerta visual. Recomendamos anexar para controle financeiro.
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isPending || processing}>
            {processing ? "Registrando..." : file ? "Pagar e Anexar" : "Pagar sem Comprovante"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
