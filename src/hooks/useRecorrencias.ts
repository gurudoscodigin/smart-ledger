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
      const payload: any = { ...rec, user_id: user!.id, ativo: true };
      const { data: inserted, error } = await supabase
        .from("recorrencias_fixas")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      // Gerar transação do mês corrente imediatamente
      const now = new Date();
      const yr = now.getFullYear();
      const mo = now.getMonth() + 1;
      const vencimento = `${yr}-${String(mo).padStart(2, "0")}-${String(rec.dia_vencimento_padrao).padStart(2, "0")}`;
      const hoje = now.getDate();
      const deveGerar = rec.eh_variavel || rec.dia_vencimento_padrao >= hoje;

      if (deveGerar) {
        const { error: txErr } = await supabase.from("transacoes").insert({
          descricao: rec.nome,
          valor: rec.eh_variavel ? 0 : rec.valor_estimado,
          data_vencimento: vencimento,
          status: "pendente",
          categoria_tipo: rec.eh_variavel ? "variavel" : "fixa",
          recorrencia_id: inserted.id,
          cartao_id: rec.cartao_id || null,
          banco_id: rec.banco_id || null,
          categoria_id: rec.categoria_id || null,
          origem: rec.origem || null,
          user_id: user!.id,
        });
        if (txErr) console.error("Erro ao gerar transação do mês corrente:", txErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recorrencias"] });
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      toast.success("Conta cadastrada e disponível no mês corrente");
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
