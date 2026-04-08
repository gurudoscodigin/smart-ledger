import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Notificacao {
  id: string;
  user_id: string;
  tipo: "vencimento_proximo" | "atraso" | "sem_comprovante" | "valor_variavel";
  titulo: string;
  mensagem: string;
  transacao_id: string | null;
  lida: boolean;
  lida_telegram: boolean;
  created_at: string;
}

export function useNotificacoes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notificacoes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notificacoes")
        .select("*")
        .eq("user_id", user!.id)
        .eq("lida", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Notificacao[];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("notificacoes")
        .update({ lida: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notificacoes"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("notificacoes")
        .update({ lida: true })
        .eq("user_id", user!.id)
        .eq("lida", false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notificacoes"] }),
  });

  return { ...query, markRead, markAllRead };
}
