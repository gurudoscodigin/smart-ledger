import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingDown, TrendingUp, Clock, FileText } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const burnData = [
  { name: "Pago", value: 4200, color: "hsl(153, 50%, 45%)" },
  { name: "Pendente", value: 2800, color: "hsl(217, 70%, 55%)" },
  { name: "Disponível", value: 3000, color: "hsl(210, 14%, 92%)" },
];

const recentActivity = [
  { user: "Maria", action: "Enviou comprovante da Adobe", time: "há 12 min" },
  { user: "João", action: "Registrou PIX R$ 130,00", time: "há 45 min" },
  { user: "Sistema", action: "Fatura cartão Roxinho fechou", time: "há 2h" },
  { user: "Você", action: "Aprovou gasto Shopify", time: "há 3h" },
];

const upcoming = [
  { name: "Adobe Creative Cloud", value: "R$ 124,00", date: "12 Abr", status: "pending" },
  { name: "Shopify Plus", value: "R$ 350,00", date: "15 Abr", status: "pending" },
  { name: "ChatGPT Plus", value: "R$ 110,00", date: "20 Abr", status: "pending" },
];

export default function CommandCenter() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão geral do seu fluxo de caixa</p>
        </div>

        {/* Top Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Saldo em Conta</p>
                  <p className="text-2xl font-semibold mt-1">R$ 12.450,00</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-status-paid/10 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-status-paid" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total a Pagar</p>
                  <p className="text-2xl font-semibold mt-1">R$ 2.800,00</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-status-late/10 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-status-late" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Pago</p>
                  <p className="text-2xl font-semibold mt-1">R$ 4.200,00</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Burn Rate Chart */}
          <Card className="glass-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base font-medium">Burn Rate — Abril 2026</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-8">
                <div className="w-52 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={burnData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {burnData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR")}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {burnData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-muted-foreground">{item.name}</span>
                      <span className="text-sm font-medium ml-auto">R$ {item.value.toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base font-medium">Feed de Atividades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{item.user}</span>{" "}
                        <span className="text-muted-foreground">{item.action}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-medium">Próximos Vencimentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcoming.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-status-pending" />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">{item.date}</span>
                    <span className="text-sm font-medium">{item.value}</span>
                    <Badge variant="secondary" className="bg-status-pending/10 text-status-pending text-xs">
                      Pendente
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
