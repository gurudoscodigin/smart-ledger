import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, AlertCircle, Upload, Image, File, Filter } from "lucide-react";
import { useState } from "react";

const documents = [
  { name: "Adobe_Mar2026.pdf", type: "pdf", date: "10 Mar", transaction: "Adobe Creative Cloud", hasReceipt: true },
  { name: "Shopify_Mar2026.png", type: "image", date: "15 Mar", transaction: "Shopify Plus", hasReceipt: true },
  { name: null, type: null, date: "20 Mar", transaction: "ChatGPT Plus", hasReceipt: false },
  { name: "Aluguel_Mar2026.pdf", type: "pdf", date: "10 Mar", transaction: "Aluguel Escritório", hasReceipt: true },
  { name: null, type: null, date: "22 Mar", transaction: "Slack Business", hasReceipt: false },
  { name: "Internet_Mar.pdf", type: "pdf", date: "05 Mar", transaction: "Internet Fibra", hasReceipt: true },
];

export default function Auditor() {
  const [filterPending, setFilterPending] = useState(false);
  const filtered = filterPending ? documents.filter((d) => !d.hasReceipt) : documents;

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
              Pendentes ({documents.filter((d) => !d.hasReceipt).length})
            </Button>
            <Button variant="outline" size="sm">
              <Upload className="w-4 h-4 mr-1.5" />
              Importar Planilha
            </Button>
          </div>
        </div>

        {/* Document Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc, i) => (
            <Card key={i} className={`glass-card cursor-pointer hover:shadow-md transition-shadow ${!doc.hasReceipt ? "ring-1 ring-status-late/30" : ""}`}>
              <CardContent className="pt-5">
                {/* Thumbnail area */}
                <div className="aspect-[4/3] bg-accent rounded-lg mb-4 flex items-center justify-center">
                  {doc.hasReceipt ? (
                    doc.type === "pdf" ? (
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
                  <p className="text-sm font-medium truncate">{doc.transaction}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{doc.date}</span>
                    {doc.hasReceipt ? (
                      <Badge variant="secondary" className="bg-status-paid/10 text-status-paid text-xs">
                        Anexado
                      </Badge>
                    ) : (
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        Anexar
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Import Area */}
        <Card className="glass-card border-dashed border-2 border-border">
          <CardContent className="py-12">
            <div className="text-center">
              <Upload className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Arrastar planilha para importar</p>
              <p className="text-xs text-muted-foreground mt-1">CSV ou XLSX — O sistema fará o mapeamento "De-Para"</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
