import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useLembretes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["lembretes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lembretes")
        .select("*")
        .order("data_lembrete", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (params: { titulo: string; descricao?: string; data_lembrete?: string }) => {
      const { error } = await supabase.from("lembretes").insert({
        ...params,
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lembretes"] });
      toast.success("Lembrete criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleConfirmado = useMutation({
    mutationFn: async ({ id, confirmado }: { id: string; confirmado: boolean }) => {
      const { error } = await supabase
        .from("lembretes")
        .update({
          confirmado,
          confirmado_at: confirmado ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lembretes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lembretes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lembretes"] });
      toast.success("Lembrete removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearConfirmados = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lembretes").delete().eq("confirmado", true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lembretes"] });
      toast.success("Confirmados limpos");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, create, toggleConfirmado, remove, clearConfirmados };
}
