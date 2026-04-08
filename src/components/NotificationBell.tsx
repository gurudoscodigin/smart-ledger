import { useState } from "react";
import { Bell, Check, CheckCheck, AlertTriangle, Clock, FileWarning, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotificacoes, Notificacao } from "@/hooks/useNotificacoes";

const tipoIcons: Record<string, any> = {
  vencimento_proximo: Clock,
  atraso: AlertTriangle,
  sem_comprovante: FileWarning,
  valor_variavel: DollarSign,
};

const tipoBg: Record<string, string> = {
  vencimento_proximo: "bg-status-pending/10 text-status-pending",
  atraso: "bg-status-late/10 text-status-late",
  sem_comprovante: "bg-amber-500/10 text-amber-600",
  valor_variavel: "bg-primary/10 text-primary",
};

export function NotificationBell() {
  const { data: notificacoes, markRead, markAllRead } = useNotificacoes();
  const [open, setOpen] = useState(false);
  const count = notificacoes?.length || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center min-w-[18px] h-[18px]">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b border-border/50">
          <span className="text-sm font-semibold">Notificações</span>
          {count > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => markAllRead.mutate()}>
              <CheckCheck className="w-3 h-3" /> Limpar tudo
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notificação</p>
          ) : (
            <div className="divide-y divide-border/30">
              {(notificacoes || []).map((n: Notificacao) => {
                const Icon = tipoIcons[n.tipo] || Bell;
                return (
                  <div key={n.id} className="p-3 flex gap-3 hover:bg-accent/30 transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tipoBg[n.tipo] || "bg-muted"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{n.titulo}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => markRead.mutate(n.id)}>
                      <Check className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
