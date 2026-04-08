import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Cartao = Tables<"cartoes">;
type CartaoInsert = TablesInsert<"cartoes">;

export function useCartoes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["cartoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cartoes")
        .select("*, bancos(nome)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (cartao: Omit<CartaoInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("cartoes")
        .insert({ ...cartao, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      toast.success("Cartão criado com sucesso");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Cartao> & { id: string }) => {
      const { error } = await supabase.from("cartoes").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      toast.success("Cartão atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cartoes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      toast.success("Cartão movido para lixeira");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, create, update, softDelete };
}
