import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useRecorrencias() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["recorrencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recorrencias_fixas")
        .select("*, categorias(nome), cartoes(apelido, final_cartao), bancos(nome)")
        .eq("ativo", true)
        .order("dia_vencimento_padrao");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (rec: {
      nome: string;
      valor_estimado: number;
      eh_variavel: boolean;
      dia_vencimento_padrao: number;
      cartao_id?: string;
      banco_id?: string;
      origem?: "email" | "site" | "pix" | "boleto" | "debito_automatico" | "dinheiro" | "cartao";
      categoria_id?: string;
      instrucoes_coleta?: string;
      url_site_login?: string;
    }) => {
      const payload: any = { ...rec, user_id: user!.id };
      const { error } = await supabase
        .from("recorrencias_fixas")
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recorrencias"] });
      toast.success("Conta fixa cadastrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("recorrencias_fixas")
        .update({ ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recorrencias"] });
      toast.success("Conta fixa desativada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, create, remove };
}
