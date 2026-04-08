import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Banco = Tables<"bancos">;

export function useBancos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["bancos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bancos")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (banco: { nome: string; saldo_atual?: number }) => {
      const { data, error } = await supabase
        .from("bancos")
        .insert({ ...banco, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
      toast.success("Banco cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, create };
}
