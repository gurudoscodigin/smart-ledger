import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CreditCard, Wifi, Zap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const cards = [
  {
    apelido: "Roxinho Softwares",
    final: "0781",
    bandeira: "Visa",
    formato: "virtual",
    limiteTotal: 10000,
    limiteDisponivel: 4200,
    fechamento: 25,
    vencimento: 5,
  },
  {
    apelido: "Itaú Empresa",
    final: "3492",
    bandeira: "Mastercard",
    formato: "fisico",
    limiteTotal: 15000,
    limiteDisponivel: 11200,
    fechamento: 20,
    vencimento: 10,
  },
];

const subscriptions = [
  { name: "Adobe Creative Cloud", value: "R$ 124,00", dueDay: 10, status: "confirmed" },
  { name: "Shopify Plus", value: "R$ 350,00", dueDay: 15, status: "pending" },
  { name: "ChatGPT Plus", value: "R$ 110,00", dueDay: 20, status: "pending" },
  { name: "Slack Business", value: "R$ 85,00", dueDay: 22, status: "pending" },
  { name: "Figma Professional", value: "R$ 65,00", dueDay: 24, status: "pending" },
];

export default function CardVault() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Card Vault</h1>
            <p className="text-muted-foreground text-sm mt-1">Gestão de cartões e assinaturas</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Cartão
          </Button>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((card) => {
            const used = card.limiteTotal - card.limiteDisponivel;
            const usedPct = (used / card.limiteTotal) * 100;
            const barColor = usedPct > 80 ? "bg-status-late" : usedPct > 60 ? "bg-primary" : "bg-status-paid";

            return (
              <Card key={card.final} className="glass-card overflow-hidden">
                <CardContent className="pt-6">
                  {/* Card Visual */}
                  <div className="relative bg-gradient-to-br from-accent to-muted rounded-xl p-6 mb-6">
                    <div className="flex items-center justify-between mb-8">
                      <span className="text-sm font-medium text-foreground">{card.apelido}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                        {card.formato === "virtual" ? (
                          <><Zap className="w-3 h-3 mr-1" />Virtual</>
                        ) : (
                          <><Wifi className="w-3 h-3 mr-1" />Físico</>
                        )}
                      </Badge>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Final</p>
                        <p className="text-lg font-mono font-semibold tracking-widest">•••• {card.final}</p>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">{card.bandeira}</p>
                    </div>
                  </div>

                  {/* Limit Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Limite utilizado</span>
                      <span className="font-medium">
                        R$ {used.toLocaleString("pt-BR")} / R$ {card.limiteTotal.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${usedPct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Disponível: R$ {card.limiteDisponivel.toLocaleString("pt-BR")}</span>
                      <span>Fecha dia {card.fechamento} · Vence dia {card.vencimento}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Subscription Timeline */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-medium">Timeline de Assinaturas — Fatura Atual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {subscriptions.map((sub, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{sub.name}</p>
                      <p className="text-xs text-muted-foreground">Cobra dia {sub.dueDay}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{sub.value}</span>
                    <Badge
                      variant="secondary"
                      className={sub.status === "confirmed" ? "bg-status-paid/10 text-status-paid text-xs" : "bg-status-pending/10 text-status-pending text-xs"}
                    >
                      {sub.status === "confirmed" ? "Confirmado" : "Previsto"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
