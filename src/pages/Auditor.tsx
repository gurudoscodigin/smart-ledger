import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, AlertCircle, Upload, Image, File, Filter } from "lucide-react";
import { useState } from "react";
import { useTransacoes } from "@/hooks/useTransacoes";
import { ImportSpreadsheetDialog } from "@/components/ImportSpreadsheetDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

export default function Auditor() {
  const { user } = useAuth();
  const { data: txData } = useTransacoes();
  const [filterPending, setFilterPending] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Get comprovantes for current transactions
  const txIds = [...(txData?.currentMonth || []), ...(txData?.overdue || [])].map(t => t.id);
  const { data: comprovantes } = useQuery({
    queryKey: ["comprovantes", txIds],
    queryFn: async () => {
      if (!txIds.length) return [];
      const { data } = await supabase
        .from("comprovantes")
        .select("transacao_id, file_name, file_type")
        .in("transacao_id", txIds.slice(0, 50));
      return data || [];
    },
    enabled: !!user && txIds.length > 0,
  });

  const compMap = new Map((comprovantes || []).map(c => [c.transacao_id, c]));
  const allTx = [...(txData?.overdue || []), ...(txData?.currentMonth || [])];
  const pendingCount = allTx.filter(t => !compMap.has(t.id)).length;
  const filtered = filterPending ? allTx.filter(t => !compMap.has(t.id)) : allTx;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">The Auditor</h1>
            <p className="text-muted-foreground text-sm mt-1">Central de comprovantes e pendências</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant={filterPending ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterPending(!filterPending)}
              className={filterPending ? "bg-status-late hover:bg-status-late/90 text-white" : ""}
            >
              <AlertCircle className="w-4 h-4 mr-1.5" />
              Pendentes ({pendingCount})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-1.5" />
              Importar Planilha
            </Button>
          </div>
        </div>

        {/* Document Grid */}
        {filtered.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {filterPending ? "Todos os comprovantes estão anexados 🎉" : "Nenhuma transação neste período"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((tx) => {
              const hasReceipt = compMap.has(tx.id);
              const comp = compMap.get(tx.id);
              return (
                <Card key={tx.id} className={`glass-card cursor-pointer hover:shadow-md transition-shadow ${!hasReceipt ? "ring-1 ring-status-late/30" : ""}`}>
                  <CardContent className="pt-5">
                    <div className="aspect-[4/3] bg-accent rounded-lg mb-4 flex items-center justify-center">
                      {hasReceipt ? (
                        comp?.file_type?.includes("pdf") ? (
                          <File className="w-10 h-10 text-muted-foreground/40" />
                        ) : (
                          <Image className="w-10 h-10 text-muted-foreground/40" />
                        )
                      ) : (
                        <div className="text-center">
                          <AlertCircle className="w-8 h-8 text-status-late/50 mx-auto mb-2" />
                          <p className="text-xs text-status-late font-medium">Sem comprovante</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium truncate">{tx.descricao}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {new Date(tx.data_vencimento).toLocaleDateString("pt-BR")} · R$ {Number(tx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        {hasReceipt ? (
                          <Badge variant="secondary" className="bg-status-paid/10 text-status-paid text-xs">Anexado</Badge>
                        ) : (
                          <Button variant="outline" size="sm" className="h-7 text-xs">Anexar</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Import Area */}
        <Card
          className="glass-card border-dashed border-2 border-border cursor-pointer hover:border-primary/30 transition-colors"
          onClick={() => setImportOpen(true)}
        >
          <CardContent className="py-12">
            <div className="text-center">
              <Upload className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Arrastar planilha para importar</p>
              <p className="text-xs text-muted-foreground mt-1">CSV — O sistema fará o mapeamento "De-Para"</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ImportSpreadsheetDialog open={importOpen} onOpenChange={setImportOpen} />
    </DashboardLayout>
  );
}
